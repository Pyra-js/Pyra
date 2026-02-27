import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { log } from "pyrajs-shared";
import type {
  PyraConfig,
  PyraAdapter,
  RouteManifest,
  ManifestRouteEntry,
  RenderContext,
  ProdServerResult,
  Middleware,
  ErrorPageProps,
  RequestContext,
} from "pyrajs-shared";
import { runMiddleware } from "../middleware.js";
import {
  createRequestContext,
  getSetCookieHeaders,
  escapeJsonForScript,
} from "../request-context.js";
import { RequestTracer, shouldTrace } from "../tracer.js";
import { applyCORS } from "../cors.js";
import { buildMatcher, type MatchResult } from "./prod-matcher.js";
import {
  buildAssetTags,
  buildCacheControlHeader,
  getCacheControl,
  getContentType,
} from "./prod-assets.js";
import { DEFAULT_SHELL, getErrorHTML, get404HTML } from "./prod-html.js";

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ProdServerOptions {
  /** Resolved path to the dist directory (e.g., /abs/path/to/dist). */
  distDir: string;
  /** The UI framework adapter (e.g., React). */
  adapter: PyraAdapter;
  /** Port to listen on (default: 3000). */
  port?: number;
  /** Pyra config for appContainerId, env prefix, etc. */
  config?: PyraConfig;
}

// ─── ProdServer ───────────────────────────────────────────────────────────────

export class ProdServer {
  private server: http.Server;
  private manifest: RouteManifest;
  private matcher: ReturnType<typeof buildMatcher>;
  private adapter: PyraAdapter;
  private distDir: string;
  private clientDir: string;
  private serverDir: string;
  private port: number;
  private containerId: string;
  private config: PyraConfig | undefined;
  private moduleCache: Map<string, Promise<any>> = new Map();
  // v1.0: Graceful shutdown
  private inflightCount = 0;
  private isShuttingDown = false;
  private shutdownResolve: (() => void) | null = null;

  constructor(options: ProdServerOptions) {
    this.distDir = options.distDir;
    this.adapter = options.adapter;
    this.port = options.port || options.config?.port || 3000;
    this.containerId = options.config?.appContainerId || "app";
    this.config = options.config;
    this.clientDir = path.join(this.distDir, "client");
    this.serverDir = path.join(this.distDir, "server");

    // Read and validate manifest
    const manifestPath = path.join(this.distDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(
        `No build output found at ${manifestPath}. Run 'pyra build' first.`,
      );
    }

    this.manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

    if (this.manifest.version !== 1) {
      throw new Error(
        `Unsupported manifest version: ${this.manifest.version}. Expected 1.`,
      );
    }

    if (this.manifest.adapter !== this.adapter.name) {
      log.warn(
        `Build was produced with adapter '${this.manifest.adapter}' but runtime is using '${this.adapter.name}'`,
      );
    }

    // Build route matcher
    this.matcher = buildMatcher(this.manifest.routes);

    // Create HTTP server
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<ProdServerResult> {
    const startTime = performance.now();

    return new Promise((resolve, reject) => {
      this.server.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          log.error(`Port ${this.port} is already in use.`);
        } else {
          log.error(`Server error: ${error.message}`);
        }
        reject(error);
      });

      this.server.listen(this.port, () => {
        const routes = Object.values(this.manifest.routes);
        let pageRouteCount = 0;
        let apiRouteCount = 0;
        let ssgRouteCount = 0;

        for (const entry of routes) {
          if (entry.type === "api") {
            apiRouteCount++;
          } else {
            pageRouteCount++;
            if (entry.prerendered) ssgRouteCount++;
          }
        }

        resolve({
          port: this.port,
          host: "localhost",
          protocol: "http",
          adapterName: this.adapter.name,
          pageRouteCount,
          apiRouteCount,
          ssgRouteCount,
          warnings: [],
          startupMs: performance.now() - startTime,
        });
      });
    });
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true;

    // Stop accepting new connections
    this.server.close();

    // Wait for in-flight requests to complete (with timeout)
    if (this.inflightCount > 0) {
      log.info(
        `Waiting for ${this.inflightCount} in-flight request(s) to complete...`,
      );
      await Promise.race([
        new Promise<void>((resolve) => {
          this.shutdownResolve = resolve;
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 10000)), // 10s timeout
      ]);
    }

    log.info("Production server stopped");
  }

  // ── Request handling ──────────────────────────────────────────────────────

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    // v1.0: Reject new requests during shutdown
    if (this.isShuttingDown) {
      res.writeHead(503, {
        "Content-Type": "text/plain",
        Connection: "close",
      });
      res.end("Service Unavailable - Shutting Down");
      return;
    }
    this.inflightCount++;

    try {
      await this.handleRequestInner(req, res);
    } finally {
      this.inflightCount--;
      if (
        this.isShuttingDown &&
        this.inflightCount === 0 &&
        this.shutdownResolve
      ) {
        this.shutdownResolve();
      }
    }
  }

  private async handleRequestInner(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const url = req.url || "/";
    const method = req.method || "GET";
    const cleanUrl = url.split("?")[0];

    // Apply CORS headers. Production CORS is opt-in — configure
    // `server.cors` in pyra.config.ts. OPTIONS preflights are handled
    // here and return 204 immediately.
    if (applyCORS(this.config?.server?.cors, req, res)) return;

    // v0.9: Conditionally create tracer based on config
    const tracing = shouldTrace(
      { headers: req.headers as any },
      this.config?.trace,
      "production",
    );
    const tracer = tracing ? new RequestTracer(method, cleanUrl) : null;

    try {
      // 0. Image optimization endpoint (when pyraImages plugin was used at build time)
      if (cleanUrl === "/_pyra/image" && this.manifest.images) {
        this.handleImageRequest(req, res, url);
        return;
      }

      // 1. Try serving static assets from dist/client/
      tracer?.start("static-check");
      const staticPath = path.join(this.clientDir, cleanUrl);
      const isStaticFile =
        fs.existsSync(staticPath) && fs.statSync(staticPath).isFile();
      tracer?.end();

      if (isStaticFile) {
        this.serveStaticFile(res, staticPath, cleanUrl);
        return;
      }

      // 2. Match against manifest routes
      tracer?.start("route-match");
      const match = this.matcher.match(cleanUrl);
      tracer?.end();

      if (!match) {
        if (tracer) {
          tracer.start("route-match", "(no match)");
          tracer.end();
        }
        // v1.0: Try custom 404 page from manifest
        const notFoundResponse = await this.renderNotFoundPage(
          req,
          cleanUrl,
          tracer,
        );
        if (tracer) {
          tracer.finalize(404);
          const headers = new Headers(notFoundResponse.headers);
          headers.set("Server-Timing", tracer.toServerTiming());
          const tracedResponse = new Response(notFoundResponse.body, {
            status: 404,
            statusText: notFoundResponse.statusText,
            headers,
          });
          await this.sendWebResponse(res, tracedResponse);
        } else {
          await this.sendWebResponse(res, notFoundResponse);
        }
        return;
      }

      tracer?.start("route-match", match.entry.id);
      tracer?.end();

      // 3. Build RequestContext
      const ctx = createRequestContext({
        req,
        params: match.params,
        routeId: match.entry.id,
        mode: "production",
        envPrefix: this.config?.env?.prefix,
      });

      // 4. Load middleware chain
      const chain = await this.loadMiddlewareChain(
        match.entry.middleware || [],
      );

      // 5. Run middleware → route handler (v1.0: wrapped in try-catch)
      let response: Response;
      try {
        response = await runMiddleware(chain, ctx, async () => {
          if (match.entry.type === "api") {
            tracer?.start("handler", method);
            try {
              const apiResponse = await this.handleApiRouteInner(
                req,
                ctx,
                match,
              );
              tracer?.end();
              return apiResponse;
            } catch (apiError) {
              const msg =
                apiError instanceof Error ? apiError.message : String(apiError);
              tracer?.endWithError(msg);
              // Prod: no error details exposed
              return new Response(
                JSON.stringify({ error: "Internal Server Error" }),
                {
                  status: 500,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
          }
          // Branch on render mode
          const renderMode = match.entry.renderMode ?? "ssr";
          if (renderMode === "spa") {
            tracer?.start("serve-spa");
            const spaResponse = this.serveSpaFallback();
            tracer?.end();
            return spaResponse;
          }
          if (renderMode === "ssg" && match.entry.prerendered) {
            tracer?.start("serve-prerendered");
            const preResponse = this.servePrerenderedPageInner(cleanUrl, match);
            tracer?.end();
            return preResponse;
          }
          return this.handlePageRouteInner(req, ctx, cleanUrl, match, tracer);
        });
      } catch (pipelineError) {
        // v1.0: Catch errors from middleware/load/render and render error boundary
        response = await this.renderErrorPage(
          req,
          cleanUrl,
          pipelineError,
          match.entry,
          tracer,
        );
      }

      // 6. v0.9: Add Server-Timing header if tracing
      if (tracer) {
        tracer.finalize(response.status);
        const headers = new Headers(response.headers);
        headers.set("Server-Timing", tracer.toServerTiming());
        const tracedResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
        await this.sendWebResponse(res, tracedResponse);
      } else {
        await this.sendWebResponse(res, response);
      }

      for (const cookie of getSetCookieHeaders(ctx)) {
        res.appendHeader("Set-Cookie", cookie);
      }
    } catch (error) {
      if (tracer) {
        const errMsg = error instanceof Error ? error.message : String(error);
        tracer.endWithError(errMsg);
        tracer.finalize(500);
      }
      log.error(`Error serving ${cleanUrl}: ${error}`);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  }

  // ── Image optimization endpoint ───────────────────────────────────────────

  private handleImageRequest(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    rawUrl: string,
  ): void {
    const params = new URLSearchParams(rawUrl.split("?")[1] ?? "");
    const src = params.get("src") ?? "";
    const w = params.get("w") ?? "";
    const format = params.get("format") ?? "webp";

    if (!src || !w || !format) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "Missing required params: src, w, format" }),
      );
      return;
    }

    const entry = this.manifest.images?.[src];
    if (!entry) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Image not in manifest" }));
      return;
    }

    const variantKey = `${w}:${format}`;
    const variant = entry.variants[variantKey];
    if (!variant) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Variant ${variantKey} not found` }));
      return;
    }

    const filePath = path.join(this.clientDir, variant.path);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Variant file missing from dist" }));
      return;
    }

    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": `image/${format}`,
      "Content-Length": content.length,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    res.end(content);
  }

  // ── Static file serving ───────────────────────────────────────────────────

  private serveStaticFile(
    res: http.ServerResponse,
    filePath: string,
    urlPath: string,
  ): void {
    const ext = path.extname(filePath);
    const contentType = getContentType(ext);
    const cacheControl = getCacheControl(urlPath);

    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": content.length,
      "Cache-Control": cacheControl,
    });
    res.end(content);
  }

  // ── Prerendered page serving ──────────────────────────────────────────────

  private servePrerenderedPageInner(
    pathname: string,
    match: MatchResult,
  ): Response {
    const { entry } = match;

    let htmlRelPath: string;
    if (entry.prerenderedFile && !entry.prerenderedCount) {
      htmlRelPath = entry.prerenderedFile;
    } else {
      htmlRelPath =
        pathname === "/" ? "index.html" : pathname.slice(1) + "/index.html";
    }

    const htmlAbsPath = path.join(this.clientDir, htmlRelPath);

    if (!fs.existsSync(htmlAbsPath)) {
      log.warn(`Prerendered file not found for ${pathname}: ${htmlAbsPath}`);
      return new Response(get404HTML(pathname), {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    }

    const content = fs.readFileSync(htmlAbsPath, "utf-8");
    const cacheControl = buildCacheControlHeader(entry.cache);

    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": cacheControl,
      },
    });
  }

  // ── SPA fallback ──────────────────────────────────────────────────────────

  private serveSpaFallback(): Response {
    const fallbackPath = this.manifest.spaFallback;
    if (!fallbackPath) {
      return new Response("SPA fallback HTML not found in build output.", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const htmlAbsPath = path.join(this.clientDir, fallbackPath);
    if (!fs.existsSync(htmlAbsPath)) {
      return new Response("SPA fallback file missing.", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const html = fs.readFileSync(htmlAbsPath, "utf-8");
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "no-cache",
      },
    });
  }

  // ── API route handler ─────────────────────────────────────────────────────

  private async handleApiRouteInner(
    req: http.IncomingMessage,
    ctx: RequestContext,
    match: MatchResult,
  ): Promise<Response> {
    const { entry } = match;
    const method = (req.method || "GET").toUpperCase();

    const allowedMethods = entry.methods || [];
    if (!allowedMethods.includes(method)) {
      return new Response(
        JSON.stringify({
          error: `Method ${method} not allowed`,
          allowed: allowedMethods,
        }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            Allow: allowedMethods.join(", "),
          },
        },
      );
    }

    if (!entry.serverEntry) {
      return new Response(
        `API route "${entry.id}" has no server entry in the manifest.`,
        { status: 500, headers: { "Content-Type": "text/plain" } },
      );
    }

    const serverPath = path.join(this.serverDir, entry.serverEntry);
    const mod = await this.importModule(serverPath);

    if (typeof mod[method] !== "function") {
      return new Response(
        `API route "${entry.id}" does not export a ${method} handler.`,
        { status: 500, headers: { "Content-Type": "text/plain" } },
      );
    }

    return mod[method](ctx);
  }

  // ── SSR pipeline ──────────────────────────────────────────────────────────

  private async handlePageRouteInner(
    req: http.IncomingMessage,
    ctx: RequestContext,
    pathname: string,
    match: MatchResult,
    tracer: RequestTracer | null,
  ): Promise<Response> {
    const { entry, params } = match;

    if (!entry.ssrEntry) {
      return new Response(
        `Route "${entry.id}" has no SSR entry in the manifest.`,
        { status: 500, headers: { "Content-Type": "text/plain" } },
      );
    }

    const ssrPath = path.join(this.serverDir, entry.ssrEntry);
    const mod = await this.importModule(ssrPath);

    const component = mod.default;
    if (!component) {
      return new Response(
        `Route "${entry.id}" (${entry.ssrEntry}) does not export a default component.`,
        { status: 500, headers: { "Content-Type": "text/plain" } },
      );
    }

    // Call load() if present (v1.0: errors propagate to renderErrorPage)
    let data: unknown = null;
    if (entry.hasLoad && typeof mod.load === "function") {
      tracer?.start("load");
      try {
        const loadResult = await mod.load(ctx);
        if (loadResult instanceof Response) {
          tracer?.end();
          return loadResult;
        }
        data = loadResult;
        tracer?.end();
      } catch (loadError) {
        const msg = loadError instanceof Error ? loadError.message : String(loadError);
        tracer?.endWithError(msg);
        throw loadError; // Re-throw so outer catch renders error boundary
      }
    }

    // Load layout components
    const layoutComponents: unknown[] = [];
    if (entry.layoutEntries && entry.layoutEntries.length > 0) {
      for (const layoutEntry of entry.layoutEntries) {
        const layoutPath = path.join(this.serverDir, layoutEntry);
        const layoutMod = await this.importModule(layoutPath);
        if (layoutMod.default) layoutComponents.push(layoutMod.default);
      }
    }

    // Build RenderContext
    const headTags: string[] = [];
    const renderContext: RenderContext = {
      url: new URL(pathname, `http://${req.headers.host || "localhost"}`),
      params,
      pushHead(tag: string) {
        headTags.push(tag);
      },
      layouts: layoutComponents.length > 0 ? layoutComponents : undefined,
    };

    tracer?.start("render", `${this.adapter.name} SSR`);
    const bodyHtml = await this.adapter.renderToHTML(
      component,
      data,
      renderContext,
    );
    tracer?.end();

    tracer?.start("inject-assets");
    const shell = this.adapter.getDocumentShell?.() || DEFAULT_SHELL;
    const assetTags = buildAssetTags(entry, this.manifest.base);

    const hydrationData: Record<string, unknown> = {};
    if (data && typeof data === "object") {
      Object.assign(hydrationData, data);
    }
    hydrationData.params = params;
    const serializedData = escapeJsonForScript(JSON.stringify(hydrationData));
    const dataScript = `<script id="__pyra_data" type="application/json">${serializedData}</script>`;

    // Build hydration script (with layout client paths if present)
    const clientEntryUrl = this.manifest.base + entry.clientEntry;
    const layoutClientUrls = entry.layoutClientEntries
      ? entry.layoutClientEntries.map((p) => this.manifest.base + p)
      : undefined;
    const hydrationScript = this.adapter.getHydrationScript(
      clientEntryUrl,
      this.containerId,
      layoutClientUrls,
    );

    let html = shell;
    html = html.replace("__CONTAINER_ID__", this.containerId);
    html = html.replace("<!--pyra-outlet-->", bodyHtml);

    const headContent =
      headTags.join("\n  ") +
      (headTags.length && assetTags.head ? "\n  " : "") +
      assetTags.head;
    html = html.replace("<!--pyra-head-->", headContent);

    html = html.replace(
      "</body>",
      `  ${dataScript}\n  ${assetTags.body}\n  <script type="module">${hydrationScript}</script>\n</body>`,
    );
    tracer?.end();

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": buildCacheControlHeader(entry.cache),
      },
    });
  }

  // ── Middleware loading ────────────────────────────────────────────────────

  /**
   * Load middleware chain from pre-built server modules.
   * @param entries - Relative paths to middleware modules in dist/server/.
   */
  private async loadMiddlewareChain(entries: string[]): Promise<Middleware[]> {
    const chain: Middleware[] = [];
    for (const entry of entries) {
      const absPath = path.join(this.serverDir, entry);
      const mod = await this.importModule(absPath);
      const fn =
        typeof mod.default === "function"
          ? mod.default
          : typeof mod.middleware === "function"
            ? mod.middleware
            : null;
      if (fn) {
        chain.push(fn);
      }
    }
    return chain;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Cached dynamic import for pre-built SSR modules.
   * Node caches by URL, but we also cache the Promise to avoid
   * repeated import() call overhead.
   */
  private async importModule(absolutePath: string): Promise<any> {
    let cached = this.moduleCache.get(absolutePath);
    if (!cached) {
      const url = pathToFileURL(absolutePath).href;
      cached = import(url);
      this.moduleCache.set(absolutePath, cached);
    }
    return cached;
  }

  /**
   * Convert a Web standard Response to a Node ServerResponse.
   */
  private async sendWebResponse(
    res: http.ServerResponse,
    webResponse: Response,
  ): Promise<void> {
    res.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    if (webResponse.body) {
      const body = await webResponse.text();
      res.end(body);
    } else {
      res.end();
    }
  }

  // ── Error boundaries (v1.0) ───────────────────────────────────────────────

  /**
   * Render the nearest error boundary for a caught error.
   * In production, error details are sanitized (no stack traces).
   * Falls back to a generic error page if no error boundary or rendering fails.
   */
  private async renderErrorPage(
    req: http.IncomingMessage,
    pathname: string,
    error: unknown,
    entry: ManifestRouteEntry,
    tracer: RequestTracer | null,
  ): Promise<Response> {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Error serving ${pathname}: ${message}`);

    if (entry.errorBoundaryEntry) {
      try {
        tracer?.start("error-boundary", entry.errorBoundaryEntry);
        const serverPath = path.join(this.serverDir, entry.errorBoundaryEntry);
        const mod = await this.importModule(serverPath);

        if (mod.default) {
          // Prod: generic message, no stack trace
          const errorProps: ErrorPageProps = {
            message: "Internal Server Error",
            statusCode: 500,
            pathname,
          };

          const headTags: string[] = [];
          const renderContext: RenderContext = {
            url: new URL(pathname, `http://${req.headers.host || "localhost"}`),
            params: {},
            pushHead: (tag) => headTags.push(tag),
            error: errorProps,
          };

          const bodyHtml = await this.adapter.renderToHTML(
            mod.default,
            errorProps,
            renderContext,
          );
          tracer?.end();

          const shell = this.adapter.getDocumentShell?.() || DEFAULT_SHELL;
          let html = shell.replace("__CONTAINER_ID__", this.containerId);
          html = html.replace("<!--pyra-outlet-->", bodyHtml);
          html = html.replace("<!--pyra-head-->", headTags.join("\n  "));

          return new Response(html, {
            status: 500,
            headers: { "Content-Type": "text/html" },
          });
        }
        tracer?.end();
      } catch (renderError) {
        const errMsg =
          renderError instanceof Error ? renderError.message : String(renderError);
        tracer?.endWithError(errMsg);
        log.error(`Error boundary rendering failed: ${errMsg}`);
      }
    }

    // Fallback: generic error page
    return new Response(getErrorHTML(), {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }

  /**
   * Render the custom 404 page or a default 404 page.
   */
  private async renderNotFoundPage(
    req: http.IncomingMessage,
    pathname: string,
    tracer: RequestTracer | null,
  ): Promise<Response> {
    const notFoundEntry = this.manifest.routes["__404"];

    if (notFoundEntry?.ssrEntry) {
      try {
        tracer?.start("404-page");
        const serverPath = path.join(this.serverDir, notFoundEntry.ssrEntry);
        const mod = await this.importModule(serverPath);

        if (mod.default) {
          const headTags: string[] = [];
          const renderContext: RenderContext = {
            url: new URL(pathname, `http://${req.headers.host || "localhost"}`),
            params: {},
            pushHead: (tag) => headTags.push(tag),
          };

          const bodyHtml = await this.adapter.renderToHTML(
            mod.default,
            { pathname },
            renderContext,
          );
          tracer?.end();

          const shell = this.adapter.getDocumentShell?.() || DEFAULT_SHELL;
          let html = shell.replace("__CONTAINER_ID__", this.containerId);
          html = html.replace("<!--pyra-outlet-->", bodyHtml);
          html = html.replace("<!--pyra-head-->", headTags.join("\n  "));

          return new Response(html, {
            status: 404,
            headers: { "Content-Type": "text/html" },
          });
        }
        tracer?.end();
      } catch (renderError) {
        const errMsg =
          renderError instanceof Error ? renderError.message : String(renderError);
        tracer?.endWithError(errMsg);
        log.error(`Custom 404 page rendering failed: ${errMsg}`);
      }
    }

    return new Response(get404HTML(pathname), {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
  }
}
