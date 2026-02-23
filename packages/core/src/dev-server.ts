import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { ImageFormat } from "pyrajs-shared";
import { isSharpAvailable, optimizeImage } from "./image-optimizer.js";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import chokidar, { type FSWatcher } from "chokidar";
import { log } from "pyrajs-shared";
import type { PyraConfig, PyraAdapter, RouteGraph, RenderContext, DevServerResult, RouteMatch, Middleware, RouteNode, ErrorPageProps, RenderMode } from "pyrajs-shared";
import { resolveRouteRenderMode } from "./render-mode.js";
import { HTTP_METHODS } from "pyrajs-shared";
import { runMiddleware } from "./middleware.js";
import { bundleFile, invalidateDependentCache, getCSSOutput } from "./bundler.js";
import { runPostCSS } from "./css-plugin.js";
import { metricsStore } from "./metrics.js";
import { scanRoutes } from "./scanner.js";
import { createRouter } from "./router.js";
import {
  createRequestContext,
  getSetCookieHeaders,
  escapeJsonForScript,
} from "./request-context.js";
import { RequestTracer } from "./tracer.js";
import esbuild from "esbuild";
import pc from "picocolors";

export interface DevServerOptions {
  port?: number;
  root?: string;
  config?: PyraConfig;
  /** The UI framework adapter (e.g., React). Enables route-aware SSR. */
  adapter?: PyraAdapter;
  /** Absolute path to the routes directory. Required if adapter is set. */
  routesDir?: string;
}

// Default document shell when the adapter doesn't provide one
const DEFAULT_SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--pyra-head-->
</head>
<body>
  <div id="app"><!--pyra-outlet--></div>
</body>
</html>`;

export class DevServer {
  private server: http.Server;
  private wss: WebSocketServer;
  private watcher: FSWatcher | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number;
  private root: string;

  // v0.2: Route-aware SSR
  private adapter: PyraAdapter | undefined;
  private routesDir: string | undefined;
  private router: RouteGraph | null = null;
  private containerId: string;
  private config: PyraConfig | undefined;
  private serverCompileCache: Map<string, { outPath: string; timestamp: number }> =
    new Map();
  private pyraTmpDir: string;
  // : verbose flag for static asset trace logging
  private verbose: boolean;
  // v1.0: Error boundary files and 404 page
  private errorFiles: Map<string, string> = new Map();
  private notFoundPage: string | undefined;
  // v1.1: Image optimization cache (key: `path|width|format|quality`)
  private imageCache: Map<string, { buffer: Buffer; format: ImageFormat; expiresAt: number }> = new Map();

  constructor(options: DevServerOptions = {}) {
    this.port = options.port || options.config?.port || 3000;
    this.root = options.root || process.cwd();
    this.adapter = options.adapter;
    this.routesDir = options.routesDir;
    this.containerId = options.config?.appContainerId || "app";
    this.config = options.config;
    this.pyraTmpDir = path.join(this.root, ".pyra", "server");
    this.verbose = false;

    // : Configure trace buffer size
    if (options.config?.trace?.bufferSize) {
      metricsStore.setTraceBufferSize(options.config.trace.bufferSize);
    }

    // Create HTTP server
    this.server = http.createServer(this.handleRequest.bind(this));

    // Create WebSocket server for HMR
    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on("error", () => {
      // Handled by the HTTP server's error listener (e.g. EADDRINUSE)
    });
    this.setupWebSocket();
  }
 
  // Handle incoming HTTP requests
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const url = req.url || "/";
    const method = req.method || "GET";

    // Remove query parameters
    const cleanUrl = url.split("?")[0];

    // Create tracer for every request in dev mode
    const tracer = new RequestTracer(method, cleanUrl);

    try {
      // Handle internal Pyra endpoints (no tracing)
      if (cleanUrl === "/__pyra_hmr_client") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(this.getHMRClientScript());
        return;
      }

      if (cleanUrl === "/_pyra") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(this.getDashboardHTML());
        return;
      }

      if (cleanUrl === "/_pyra/api/metrics") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            summary: metricsStore.getSummary(),
            latestBuild: metricsStore.getLatestBuild(),
            buildHistory: metricsStore.getBuildHistory(20),
            hmrHistory: metricsStore.getHMRHistory(50),
            dependencyGraph: metricsStore.getDependencyGraph(),
          }),
        );
        return;
      }

      // Trace API endpoints
      if (cleanUrl === "/_pyra/api/traces") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(metricsStore.getRecentTraces()));
        return;
      }
      if (cleanUrl === "/_pyra/api/traces/stats") {
        const stats = metricsStore.routeStats();
        const obj: Record<string, any> = {};
        for (const [key, val] of stats) {
          obj[key] = val;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
        return;
      }
      if (cleanUrl.startsWith("/_pyra/api/traces/") && cleanUrl !== "/_pyra/api/traces/stats") {
        const traceId = cleanUrl.slice("/_pyra/api/traces/".length);
        const trace = metricsStore.getTrace(traceId);
        if (trace) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(trace));
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Trace not found" }));
        }
        return;
      }

      if (cleanUrl === "/_pyra/ws") {
        return;
      }

      // Image optimization endpoint — only active when pyraImages plugin is configured
      if (cleanUrl === "/_pyra/image") {
        const hasImagePlugin = this.config?.plugins?.some((p) => p.name === "pyra:images");
        if (hasImagePlugin) {
          await this.handleImageRequest(req, res, url);
          return;
        }
      }

      // Serve CSS extracted from a bundled client module.
      // The dev server injects <link> tags pointing here during SSR page assembly
      // so that stylesheets load as real <link> elements (no FOUC).
      if (cleanUrl.startsWith("/__pyra/styles/")) {
        const modulePath = cleanUrl.slice("/__pyra/styles/".length);
        const absolutePath = path.resolve(this.root, modulePath);

        if (!fs.existsSync(absolutePath)) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Module not found");
          return;
        }

        // bundleFile populates cssOutputCache as a side-effect; call it if
        // the CSS isn't cached yet (e.g. a direct browser refresh).
        let css = getCSSOutput(absolutePath);
        if (css === null) {
          await bundleFile(absolutePath, this.root, this.config?.resolve);
          css = getCSSOutput(absolutePath);
        }

        if (css !== null) {
          res.writeHead(200, {
            "Content-Type": "text/css",
            "Cache-Control": "no-cache",
          });
          res.end(css);
        } else {
          // The module exists but produced no CSS output
          res.writeHead(204, {});
          res.end();
        }
        return;
      }

      // Serve client-side module for hydration
      if (cleanUrl.startsWith("/__pyra/modules/")) {
        const modulePath = cleanUrl.slice("/__pyra/modules/".length);
        const absolutePath = path.resolve(this.root, modulePath);

        if (!fs.existsSync(absolutePath)) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Module not found");
          return;
        }

        const compiled = await bundleFile(absolutePath, this.root, this.config?.resolve);
        res.writeHead(200, {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-cache",
        });
        res.end(compiled);
        return;
      }

      // Serve static files from public/ before route matching.
      // This ensures /favicon.ico, /robots.txt, /images/*, etc. are served
      // directly without hitting the router.
      const publicFilePath = this.resolvePublicFilePath(cleanUrl);
      if (publicFilePath) {
        this.servePublicFile(res, publicFilePath);
        return;
      }

      // Route-aware SSR pipeline
      if (this.adapter && this.router) {
        // v0.9: Trace route matching
        tracer.start("route-match");
        const match = this.router.match(cleanUrl);
        tracer.end();

        if (match) {
          tracer.setDetail(match.route.id);

          // Build RequestContext for middleware + handlers
          const ctx = createRequestContext({
            req,
            params: match.params,
            routeId: match.route.id,
            mode: "development",
          });

          // Load middleware chain
          const chain = await this.loadMiddlewareChain(match.route.middlewarePaths);

          let response: Response;
          try {
            // Run middleware → route handler (with tracing)
            response = await runMiddleware(chain, ctx, async () => {
              if (match.route.type === "api") {
                return this.handleApiRouteInner(req, ctx, match, tracer);
              }
              return this.handlePageRouteInner(req, ctx, cleanUrl, match, tracer);
            });
          } catch (pipelineError) {
            // v1.0: Catch errors from middleware/load/render and render error boundary
            response = await this.renderErrorPage(req, cleanUrl, pipelineError, match.route, match, tracer);
          }

          // Finalize trace and set Server-Timing header
          const trace = tracer.finalize(response.status);
          metricsStore.recordTrace(trace);
          console.log(tracer.toDetailedLog(response.status));

          // Send response + cookies + Server-Timing
          const headers = new Headers(response.headers);
          headers.set("Server-Timing", tracer.toServerTiming());
          const tracedResponse = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });

          await this.sendWebResponse(res, tracedResponse);
          const setCookies = getSetCookieHeaders(ctx);
          for (const cookie of setCookies) {
            res.appendHeader("Set-Cookie", cookie);
          }

          // Close out the HMR build if one is active. totalDuration runs from
          // the file-change event to right now — the real perceived rebuild
          // latency. bundleSize is the sum of all files compiled in this request.
          if (metricsStore.isActiveBuild()) metricsStore.finishBuild();

          return;
        }

        // No route matched — render custom 404 page or default
        const notFoundResponse = await this.renderNotFoundPage(req, cleanUrl, tracer);
        const trace = tracer.finalize(404);
        metricsStore.recordTrace(trace);
        console.log(tracer.toDetailedLog(404));

        const headers = new Headers(notFoundResponse.headers);
        headers.set("Server-Timing", tracer.toServerTiming());
        const tracedResponse = new Response(notFoundResponse.body, {
          status: notFoundResponse.status,
          statusText: notFoundResponse.statusText,
          headers,
        });
        await this.sendWebResponse(res, tracedResponse);
        return;
      }

      // Static file serving 
      tracer.start("static");
      let filePath = path.join(
        this.root,
        cleanUrl === "/" ? "/index.html" : cleanUrl,
      );

      // Check if file exists — also look in public/ as a fallback
      if (!fs.existsSync(filePath)) {
        if (fs.existsSync(filePath + ".html")) {
          filePath = filePath + ".html";
        } else {
          // Try public/ directory before giving up
          const publicFilePath = this.resolvePublicFilePath(cleanUrl);
          if (publicFilePath) {
            tracer.end();
            this.servePublicFile(res, publicFilePath);
            return;
          }
          tracer.end();
          const trace = tracer.finalize(404);
          metricsStore.recordTrace(trace);
          console.log(tracer.toDetailedLog(404));
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("404 Not Found");
          return;
        }
      }

      // Check if it's a directory, serve index.html
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, "index.html");
        if (!fs.existsSync(filePath)) {
          tracer.end();
          const trace = tracer.finalize(404);
          metricsStore.recordTrace(trace);
          console.log(tracer.toDetailedLog(404));
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("404 Not Found");
          return;
        }
      }

      // Read file
      let content = fs.readFileSync(filePath, "utf-8");
      const ext = path.extname(filePath);
      tracer.end();

      // Process CSS files through PostCSS (e.g. Tailwind directives).
      if (ext === ".css") {
        content = await this.processCSS(filePath, content);
        res.writeHead(200, { "Content-Type": "text/css", "Cache-Control": "no-cache" });
        res.end(content);
        if (this.verbose) console.log(tracer.toDetailedLog(200));
        return;
      }

      // Bundle and transform TypeScript/JSX files with module resolution
      if (/\.(tsx?|jsx?|mjs)$/.test(ext)) {
        content = await bundleFile(filePath, this.root, this.config?.resolve);
        res.writeHead(200, {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-cache",
        });
        res.end(content);
        // Only log static traces in verbose mode
        if (this.verbose) {
          console.log(tracer.toDetailedLog(200));
        }
        return;
      }

      // Inject HMR client into HTML files
      if (ext === ".html") {
        content = this.injectHMRClient(content);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(content);
        if (this.verbose) {
          console.log(tracer.toDetailedLog(200));
        }
        return;
      }

      // Serve other files with appropriate content type
      const contentType = this.getContentType(ext);
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control":
          ext === ".css" || ext === ".js"
            ? "no-cache"
            : "public, max-age=31536000",
      });
      res.end(content);
      if (this.verbose) {
        console.log(tracer.toDetailedLog(200));
      }
    } catch (error) {
      // Log error trace
      const errMsg = error instanceof Error ? error.message : String(error);
      tracer.endWithError(errMsg);
      const trace = tracer.finalize(500);
      metricsStore.recordTrace(trace);
      console.log(tracer.toDetailedLog(500));

      log.error(`Error serving ${cleanUrl}: ${error}`);
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end(this.getErrorHTML(cleanUrl, error));
    }
  }

  // SSR Pipeline 
  /**
   * Inner page route handler that returns a Response.
   * Called from within the middleware chain.
   */
  private async handlePageRouteInner(
    req: http.IncomingMessage,
    ctx: import("pyrajs-shared").RequestContext,
    pathname: string,
    match: RouteMatch,
    tracer: RequestTracer,
  ): Promise<Response> {
    const { route, params } = match;
    const adapter = this.adapter!;

    // Compile the route module for server (Node target, framework external)
    tracer.start("compile");
    const serverModule = await this.compileForServer(route.filePath);

    // Import the compiled module
    const moduleUrl =
      pathToFileURL(serverModule).href + `?t=${Date.now()}`;
    const mod = await import(moduleUrl);
    const component = mod.default;
    tracer.end();

    // Resolve render mode for this route
    const globalMode: RenderMode = this.config?.renderMode ?? "ssr";
    const mode = resolveRouteRenderMode(mod, globalMode);

    // SPA route: serve HTML shell with client module only, no SSR
    if (mode === "spa") {
      return this.serveSpaShell(req, route, tracer);
    }

    // SSR + SSG (SSG treated as SSR in dev for fast feedback)
    if (!component) {
      return new Response(
        `Route "${route.id}" (${route.filePath}) does not export a default component.`,
        { status: 500, headers: { "Content-Type": "text/plain" } },
      );
    }

    // Call load() if exported
    let data: unknown = null;
    if (typeof mod.load === "function") {
      tracer.start("load");
      try {
        const loadResult = await mod.load(ctx);

        // If load() returns a Response, short-circuit the SSR pipeline
        if (loadResult instanceof Response) {
          tracer.end();
          return loadResult;
        }

        data = loadResult;
        tracer.end();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        tracer.endWithError(msg);
        throw err;
      }
    }

    // Load layout components
    const layoutComponents: unknown[] = [];
    const layoutClientUrls: string[] = [];
    if (match.layouts && match.layouts.length > 0) {
      for (const layoutNode of match.layouts) {
        const layoutModule = await this.compileForServer(layoutNode.filePath);
        const layoutUrl =
          pathToFileURL(layoutModule).href + `?t=${Date.now()}`;
        const layoutMod = await import(layoutUrl);
        if (layoutMod.default) {
          layoutComponents.push(layoutMod.default);
          // Build client URL for this layout
          const clientPath = path.relative(this.root, layoutNode.filePath);
          layoutClientUrls.push(
            "/__pyra/modules/" + clientPath.split(path.sep).join("/"),
          );
        }
      }
    }

    // Eagerly compile client modules (layouts first, then the page) to extract
    // any CSS they import. bundleFile stores the CSS in cssOutputCache as a
    // side-effect; we then build <link> tags so browsers get real stylesheets
    // instead of JS-injected <style> elements (which cause FOUC).
    const cssLinkTags: string[] = [];
    const clientFilesForCSS = [
      ...(match.layouts ?? []).map((l) => l.filePath),
      route.filePath,
    ];
    for (const clientFile of clientFilesForCSS) {
      await bundleFile(clientFile, this.root, this.config?.resolve);
      const css = getCSSOutput(clientFile);
      if (css) {
        const clientRelPath = path.relative(this.root, clientFile);
        const stylesUrl =
          "/__pyra/styles/" + clientRelPath.split(path.sep).join("/");
        cssLinkTags.push(`<link rel="stylesheet" href="${stylesUrl}">`);
      }
    }

    // Build RenderContext — CSS link tags are prepended so they load before
    // any head tags the adapter pushes (e.g. meta, title).
    const headTags: string[] = [...cssLinkTags];
    const renderContext: RenderContext = {
      url: new URL(pathname, `http://${req.headers.host || "localhost"}`),
      params,
      pushHead(tag: string) {
        headTags.push(tag);
      },
      layouts: layoutComponents.length > 0 ? layoutComponents : undefined,
    };

    // Call adapter.renderToHTML() with load data
    tracer.start("render", `${adapter.name} SSR`);
    const bodyHtml = await adapter.renderToHTML(component, data, renderContext);
    tracer.end();

    // Get document shell
    const shell = adapter.getDocumentShell?.() || DEFAULT_SHELL;

    // Build the client module URL for hydration
    const clientModulePath = path.relative(this.root, route.filePath);
    const clientModuleUrl =
      "/__pyra/modules/" + clientModulePath.split(path.sep).join("/");

    // Get hydration script from adapter (with layout paths if present)
    const hydrationScript = adapter.getHydrationScript(
      clientModuleUrl,
      this.containerId,
      layoutClientUrls.length > 0 ? layoutClientUrls : undefined,
    );

    // Serialize data for client hydration
    tracer.start("inject-assets");
    const hydrationData: Record<string, unknown> = {};
    if (data && typeof data === "object") {
      Object.assign(hydrationData, data);
    }
    hydrationData.params = params;
    const serializedData = escapeJsonForScript(JSON.stringify(hydrationData));
    const dataScript = `<script id="__pyra_data" type="application/json">${serializedData}</script>`;

    // Assemble the full HTML
    let html = shell;
    html = html.replace("__CONTAINER_ID__", this.containerId);
    html = html.replace("<!--pyra-outlet-->", bodyHtml);

    const headContent = headTags.join("\n  ");
    html = html.replace("<!--pyra-head-->", headContent);

    const scripts = [
      dataScript,
      `<script type="module">${hydrationScript}</script>`,
    ].join("\n  ");

    html = this.injectHMRClient(html);
    html = html.replace("</body>", `  ${scripts}\n</body>`);
    tracer.end();

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "no-cache",
      },
    });
  }

  // ── SPA Shell ────────────────────────────────────────────────────────────────

  /**
   * Serve an HTML shell for SPA routes.
   * No server rendering — the client module handles everything.
   */
  private serveSpaShell(
    req: http.IncomingMessage,
    route: RouteNode,
    tracer: RequestTracer,
  ): Response {
    tracer.start("inject-assets", "SPA shell");
    const adapter = this.adapter!;
    const shell = adapter.getDocumentShell?.() || DEFAULT_SHELL;

    // Build client module URL for the route
    const clientModulePath = path.relative(this.root, route.filePath);
    const clientModuleUrl =
      "/__pyra/modules/" + clientModulePath.split(path.sep).join("/");

    let html = shell;
    html = html.replace("__CONTAINER_ID__", this.containerId);
    html = html.replace("<!--pyra-outlet-->", "");
    html = html.replace("<!--pyra-head-->", "");

    const script = `<script type="module" src="${clientModuleUrl}"></script>`;
    html = this.injectHMRClient(html);
    html = html.replace("</body>", `  ${script}\n</body>`);
    tracer.end();

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "no-cache",
        "X-Pyra-Render-Mode": "spa",
      },
    });
  }

  // ── API Route Handler ─────────────────────────────────────────────────────────

  /**
   * Inner API route handler that returns a Response.
   * Called from within the middleware chain.
   */
  private async handleApiRouteInner(
    req: http.IncomingMessage,
    ctx: import("pyrajs-shared").RequestContext,
    match: RouteMatch,
    tracer: RequestTracer,
  ): Promise<Response> {
    const { route } = match;

    // 1. Compile the API route module for server
    tracer.start("compile");
    const serverModule = await this.compileForServer(route.filePath);

    // 2. Import the compiled module (cache-bust for re-import after recompile)
    const moduleUrl =
      pathToFileURL(serverModule).href + `?t=${Date.now()}`;
    const mod = await import(moduleUrl);
    tracer.end();

    // 3. Check HTTP method
    const method = (req.method || "GET").toUpperCase();

    if (typeof mod[method] !== "function") {
      const allowedMethods = (HTTP_METHODS as readonly string[]).filter(
        (m) => typeof mod[m] === "function",
      );
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

    // 4. Call the handler with the shared RequestContext
    tracer.start("handler", method);
    try {
      const response = await mod[method](ctx);
      tracer.end();
      return response;
    } catch (handlerError) {
      const msg = handlerError instanceof Error ? handlerError.message : String(handlerError);
      const stack = handlerError instanceof Error ? handlerError.stack : undefined;
      tracer.endWithError(msg);
      // Dev mode: return full error details in JSON
      return new Response(
        JSON.stringify({ error: msg, stack }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  // ── Middleware Loading ──────────────────────────────────────────────────────

  /**
   * Compile and import middleware files, returning an array of Middleware functions.
   */
  private async loadMiddlewareChain(middlewarePaths: string[]): Promise<Middleware[]> {
    const chain: Middleware[] = [];
    for (const filePath of middlewarePaths) {
      const compiled = await this.compileForServer(filePath);
      const moduleUrl = pathToFileURL(compiled).href + `?t=${Date.now()}`;
      const mod = await import(moduleUrl);
      const fn = typeof mod.default === "function" ? mod.default : typeof mod.middleware === "function" ? mod.middleware : null;
      if (fn) {
        chain.push(fn);
      }
    }
    return chain;
  }

  /**
   * Send a Web standard Response through Node's ServerResponse.
   * Used when load() returns a Response (e.g., redirect).
   */
  private async sendWebResponse(
    res: http.ServerResponse,
    webResponse: Response,
  ): Promise<void> {
    // Copy status
    res.statusCode = webResponse.status;

    // Copy headers
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    // Copy body
    if (webResponse.body) {
      const body = await webResponse.text();
      res.end(body);
    } else {
      res.end();
    }
  }

  /**
   * Compile a route module for server-side execution.
   *
   * Uses esbuild with:
   * - platform: 'node' (so it can import() the result)
   * - format: 'esm'
   * - jsx: 'automatic' with react import source
   * - external: react, react-dom (resolved from node_modules at import time)
   *
   * Writes output to .pyra/server/ temp directory. Uses a simple timestamp
   * cache — recompiles only when the source file is newer than the output.
   */
  private async compileForServer(filePath: string): Promise<string> {
    // Determine output path: .pyra/server/<relative-path>.mjs
    const relativePath = path.relative(this.root, filePath);
    const outFileName =
      relativePath.split(path.sep).join("_").replace(/\.[^.]+$/, "") + ".mjs";
    const outPath = path.join(this.pyraTmpDir, outFileName);

    // Check cache: skip recompile if output is newer than source
    const cached = this.serverCompileCache.get(filePath);
    if (cached && fs.existsSync(cached.outPath)) {
      try {
        const srcStat = fs.statSync(filePath);
        if (srcStat.mtimeMs <= cached.timestamp) {
          return cached.outPath;
        }
      } catch {
        // File may have been deleted — recompile
      }
    }

    // Ensure output directory exists
    fs.mkdirSync(this.pyraTmpDir, { recursive: true });

    // Compile with esbuild
    await esbuild.build({
      entryPoints: [filePath],
      outfile: outPath,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "es2020",
      jsx: "automatic",
      jsxImportSource: "react",
      // React stays external — resolved from node_modules when we import()
      external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
      sourcemap: "inline",
      logLevel: "silent",
      absWorkingDir: this.root,
    });

    // Update cache
    this.serverCompileCache.set(filePath, {
      outPath,
      timestamp: Date.now(),
    });

    return outPath;
  }

  // ── Route scanning ──────────────────────────────────────────────────────────

  /**
   * Scan routes and build the RouteGraph. Called at startup and when
   * route files are added/removed.
   */
  private async buildRouteGraph(): Promise<void> {
    if (!this.adapter || !this.routesDir) return;

    const scanResult = await scanRoutes(
      this.routesDir,
      [...this.adapter.fileExtensions],
    );
    this.router = createRouter(scanResult);

    // v1.0: Store error boundary files and 404 page reference
    this.errorFiles.clear();
    for (const err of scanResult.errors) {
      this.errorFiles.set(err.dirId, err.filePath);
    }
    this.notFoundPage = scanResult.notFoundPage;

    // : Print detailed route table at startup
    this.printRouteTable(scanResult);
  }

  /**
   * : Print the dev startup route table.
   */
  private printRouteTable(scanResult: import("./scanner.js").ScanResult): void {
    if (!this.router) return;

    const pages = this.router.pageRoutes();
    const apis = this.router.apiRoutes();
    const totalRoutes = pages.length + apis.length;

    console.log('');
    console.log(`  ${pc.bold('Routes')} ${pc.dim(`(${totalRoutes} routes, ${pages.length} pages, ${apis.length} APIs)`)}`);
    console.log('');

    // Page Routes
    if (pages.length > 0) {
      console.log(`  ${pc.bold('Page Routes')}`);
      console.log(`  ${pc.dim('\u2500'.repeat(64))}`);

      for (const route of pages) {
        const pattern = route.pattern.padEnd(24);
        const file = pc.dim(path.basename(route.filePath));

        // Collect annotations
        const annotations: string[] = [];

        // Layout info
        if (route.layoutId) {
          const layoutName = route.layoutId === '/' ? 'root' : route.layoutId.slice(1);
          annotations.push(`${pc.dim('layout:')} ${pc.cyan(layoutName)}`);
        }

        // Middleware info
        if (route.middlewarePaths.length > 0) {
          const mwNames = route.middlewarePaths.map(p => {
            const dir = path.dirname(path.relative(this.routesDir!, p));
            return dir === '.' ? 'root' : dir;
          });
          annotations.push(`${pc.dim('mw:')} ${pc.yellow(mwNames.join(', '))}`);
        }

        const annotStr = annotations.length > 0 ? `  ${annotations.join('  ')}` : '';
        console.log(`  ${pc.green(pattern)}  ${file}${annotStr}`);
      }
      console.log('');
    }

    // API Routes
    if (apis.length > 0) {
      console.log(`  ${pc.bold('API Routes')}`);
      console.log(`  ${pc.dim('\u2500'.repeat(64))}`);

      for (const route of apis) {
        const pattern = route.pattern.padEnd(24);
        const file = pc.dim(path.basename(route.filePath));

        // Detect exported HTTP methods via regex scan
        const methods = this.detectApiMethods(route);
        const methodStr = methods.length > 0 ? `  ${pc.cyan(methods.join(' '))}` : '';

        console.log(`  ${pc.green(pattern)}  ${file}${methodStr}`);
      }
      console.log('');
    }

    // Middleware summary
    if (scanResult.middlewares.length > 0) {
      console.log(`  ${pc.bold('Middleware')}`);
      console.log(`  ${pc.dim('\u2500'.repeat(64))}`);
      for (const mw of scanResult.middlewares) {
        const relPath = path.relative(this.routesDir!, mw.filePath);
        const scope = mw.dirId === '/' ? 'all routes (root)' : `${mw.dirId}/**`;
        console.log(`  ${pc.dim(relPath.split(path.sep).join('/'))}  ${pc.dim('\u2192')} ${scope}`);
      }
      console.log('');
    }

    // Layout summary
    if (scanResult.layouts.length > 0) {
      console.log(`  ${pc.bold('Layouts')}`);
      console.log(`  ${pc.dim('\u2500'.repeat(64))}`);
      for (const layout of scanResult.layouts) {
        const relPath = path.relative(this.routesDir!, layout.filePath);
        const scope = layout.id === '/' ? 'all pages (root)' : this.getLayoutScope(layout.id, pages);
        console.log(`  ${pc.dim(relPath.split(path.sep).join('/'))}  ${pc.dim('\u2192')} ${scope}`);
      }
      console.log('');
    }

    // Error boundary summary
    if (scanResult.errors.length > 0) {
      console.log(`  ${pc.bold('Error Boundaries')}`);
      console.log(`  ${pc.dim('\u2500'.repeat(64))}`);
      for (const err of scanResult.errors) {
        const relPath = path.relative(this.routesDir!, err.filePath);
        const scope = err.dirId === '/' ? 'all routes (root)' : `${err.dirId}/**`;
        console.log(`  ${pc.dim(relPath.split(path.sep).join('/'))}  ${pc.dim('\u2192')} ${scope}`);
      }
      console.log('');
    }

    // 404 page
    if (scanResult.notFoundPage) {
      const relPath = path.relative(this.routesDir!, scanResult.notFoundPage);
      console.log(`  ${pc.bold('404 Page')}  ${pc.dim(relPath.split(path.sep).join('/'))}`);
      console.log('');
    }
  }

  /**
   * Detect exported HTTP methods from an API route file via regex scan.
   * Avoids importing the module at startup.
   */
  private detectApiMethods(route: RouteNode): string[] {
    try {
      const source = fs.readFileSync(route.filePath, 'utf-8');
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
      return methods.filter((method) => {
        const pattern = new RegExp(
          `export\\s+(async\\s+)?function\\s+${method}\\b|export\\s+(const|let)\\s+${method}\\b`
        );
        return pattern.test(source);
      });
    } catch {
      return [];
    }
  }

  /**
   * Get a human-readable scope string for a layout.
   */
  private getLayoutScope(layoutId: string, pages: RouteNode[]): string {
    const matching = pages
      .filter(p => p.layoutId === layoutId || p.id.startsWith(layoutId + '/') || p.id === layoutId)
      .map(p => p.pattern);
    if (matching.length <= 3) return matching.join(', ');
    return `${matching.slice(0, 2).join(', ')}, +${matching.length - 2} more`;
  }

  // ── Error Boundaries (v1.0) ────────────────────────────────────────────────

  /**
   * Render the nearest error boundary (error.tsx) for a caught error.
   * Falls back to the default styled error page if no boundary exists
   * or the boundary itself throws.
   */
  private async renderErrorPage(
    req: http.IncomingMessage,
    pathname: string,
    error: unknown,
    route: RouteNode | null,
    match: RouteMatch | null,
    tracer: RequestTracer,
  ): Promise<Response> {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    log.error(`Error rendering ${pathname}: ${message}`);

    // Try to find and render the nearest error boundary
    const errorBoundaryId = route?.errorBoundaryId;
    if (errorBoundaryId && this.adapter) {
      const errorFilePath = this.errorFiles.get(errorBoundaryId);
      if (errorFilePath) {
        try {
          tracer.start("error-boundary", errorFilePath);
          const compiled = await this.compileForServer(errorFilePath);
          const modUrl = pathToFileURL(compiled).href + `?t=${Date.now()}`;
          const mod = await import(modUrl);

          if (mod.default) {
            const errorProps: ErrorPageProps = {
              message,
              stack,
              statusCode: 500,
              pathname,
            };

            const headTags: string[] = [];
            const renderContext: RenderContext = {
              url: new URL(pathname, `http://${req.headers.host || "localhost"}`),
              params: match?.params || {},
              pushHead: (tag) => headTags.push(tag),
              error: errorProps,
            };

            const bodyHtml = await this.adapter.renderToHTML(mod.default, errorProps, renderContext);
            tracer.end();

            const shell = this.adapter.getDocumentShell?.() || DEFAULT_SHELL;
            let html = shell.replace("__CONTAINER_ID__", this.containerId);
            html = html.replace("<!--pyra-outlet-->", bodyHtml);
            html = html.replace("<!--pyra-head-->", headTags.join("\n  "));
            html = this.injectHMRClient(html);

            return new Response(html, {
              status: 500,
              headers: { "Content-Type": "text/html" },
            });
          }
          tracer.end();
        } catch (renderError) {
          // Error boundary itself failed — fall through to default
          const errMsg = renderError instanceof Error ? renderError.message : String(renderError);
          tracer.endWithError(errMsg);
          log.error(`Error boundary failed: ${errMsg}`);
        }
      }
    }

    // Fallback: default styled error HTML
    return new Response(this.getErrorHTML(pathname, error), {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }

  /**
   * Render the custom 404 page (404.tsx) or a default styled 404 page.
   */
  private async renderNotFoundPage(
    req: http.IncomingMessage,
    pathname: string,
    tracer: RequestTracer,
  ): Promise<Response> {
    if (this.notFoundPage && this.adapter) {
      try {
        tracer.start("404-page", this.notFoundPage);
        const compiled = await this.compileForServer(this.notFoundPage);
        const modUrl = pathToFileURL(compiled).href + `?t=${Date.now()}`;
        const mod = await import(modUrl);

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
          tracer.end();

          const shell = this.adapter.getDocumentShell?.() || DEFAULT_SHELL;
          let html = shell.replace("__CONTAINER_ID__", this.containerId);
          html = html.replace("<!--pyra-outlet-->", bodyHtml);
          html = html.replace("<!--pyra-head-->", headTags.join("\n  "));
          html = this.injectHMRClient(html);

          return new Response(html, {
            status: 404,
            headers: { "Content-Type": "text/html" },
          });
        }
        tracer.end();
      } catch (renderError) {
        const errMsg = renderError instanceof Error ? renderError.message : String(renderError);
        tracer.endWithError(errMsg);
        log.error(`Failed to render custom 404 page: ${errMsg}`);
      }
    }

    // Fallback: default styled 404
    return new Response(this.getDefault404HTML(pathname), {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
  }

  /**
   * Default styled 404 page (used when no custom 404.tsx exists).
   */
  private getDefault404HTML(pathname: string): string {
    return `<!DOCTYPE html>
<html><head><title>404 Not Found</title>
<style>
  body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .container { text-align: center; }
  h1 { font-size: 4rem; color: #ff6b35; margin: 0; }
  p { color: #999; margin-top: 1rem; }
  code { color: #4fc3f7; }
</style></head>
<body>
  <div class="container">
    <h1>404</h1>
    <p>Page <code>${pathname}</code> not found</p>
  </div>
</body></html>`;
  }

  // ── Error page ──────────────────────────────────────────────────────────────

  private getErrorHTML(pathname: string, error: unknown): string {
    const message =
      error instanceof Error ? error.message : String(error);
    const stack =
      error instanceof Error ? error.stack || "" : "";

    return `<!DOCTYPE html>
<html><head><title>Pyra Error</title>
<style>
  body { font-family: monospace; background: #1a1a2e; color: #e0e0e0; padding: 40px; }
  h1 { color: #ff6b35; }
  .path { color: #4fc3f7; }
  pre { background: #0f0f1a; padding: 20px; border-radius: 8px; overflow-x: auto;
        border-left: 3px solid #ff6b35; white-space: pre-wrap; }
</style></head>
<body>
  <h1>Server Error</h1>
  <p>Error rendering <span class="path">${pathname}</span></p>
  <pre>${message}\n\n${stack}</pre>
</body></html>`;
  }

  // ── WebSocket & HMR (unchanged from v0.1) ──────────────────────────────────

  private setupWebSocket(): void {
    this.wss.on("connection", (ws: WebSocket) => {
      this.clients.add(ws);
      log.info("HMR client connected");

      ws.on("close", () => {
        this.clients.delete(ws);
      });
    });
  }

  private setupFileWatcher(): void {
    this.watcher = chokidar.watch(this.root, {
      ignored: /(^|[\/\\])(\.|node_modules)/,
      ignoreInitial: true,
      persistent: true,
    });

    this.watcher.on("change", async (filePath: string) => {
      const relativePath = path.relative(this.root, filePath);
      log.info(`File changed: ${relativePath}`);

      // If a previous HMR event started a build that no request ever closed
      // (e.g. two rapid saves), finalize it now before starting a new one.
      if (metricsStore.isActiveBuild()) metricsStore.finishBuild();

      // Start the build clock. It stays open until the first request that
      // follows this change finishes compiling and calls finishBuild().
      metricsStore.startBuild();

      const startTime = Date.now();

      // Invalidate caches
      invalidateDependentCache(filePath);
      this.serverCompileCache.delete(filePath);

      // If a route file changed and we have a router, rebuild the route graph
      if (this.routesDir && filePath.startsWith(this.routesDir)) {
        const basename = path.basename(filePath);
        if (
          basename.startsWith("page.") ||
          basename.startsWith("route.") ||
          basename.startsWith("layout.") ||
          basename.startsWith("middleware.")
        ) {
          await this.buildRouteGraph();
        }
      }

      metricsStore.addHMREvent({
        type: "reload",
        file: relativePath,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
      });

      this.notifyClients("reload");
    });

    this.watcher.on("add", async (filePath: string) => {
      const relativePath = path.relative(this.root, filePath);
      log.info(`File added: ${relativePath}`);

      if (metricsStore.isActiveBuild()) metricsStore.finishBuild();
      metricsStore.startBuild();

      const startTime = Date.now();

      invalidateDependentCache(filePath);

      // If a new route file was added, rebuild the route graph
      if (this.routesDir && filePath.startsWith(this.routesDir)) {
        const basename = path.basename(filePath);
        if (
          basename.startsWith("page.") ||
          basename.startsWith("route.")
        ) {
          await this.buildRouteGraph();
        }
      }

      metricsStore.addHMREvent({
        type: "reload",
        file: relativePath,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
      });

      this.notifyClients("reload");
    });
  }

  private notifyClients(type: string): void {
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type }));
      }
    });
  }

  private injectHMRClient(html: string): string {
    const script = `<script type="module" src="/__pyra_hmr_client"></script>`;

    if (html.includes("</head>")) {
      return html.replace("</head>", `${script}\n</head>`);
    }
    if (html.includes("</body>")) {
      return html.replace("</body>", `${script}\n</body>`);
    }
    return html + script;
  }

  private getHMRClientScript(): string {
    return `
// Pyra.js HMR Client
(function() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const ws = new WebSocket(protocol + '//' + host);

  ws.addEventListener('open', () => {
    console.log('[pyra] HMR connected');
  });

  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'reload') {
      console.log('[pyra] Reloading page...');
      window.location.reload();
    }
  });

  ws.addEventListener('close', () => {
    console.log('[pyra] HMR disconnected. Reload the page to reconnect.');
  });

  ws.addEventListener('error', (error) => {
    console.error('[pyra] HMR error:', error);
  });
})();
    `.trim();
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  /**
   * Run a CSS file's content through PostCSS if a postcss.config.* exists in
   * the project root. Falls back to the raw source when PostCSS is not
   * configured or not installed in the user's project.
   */
  private async processCSS(filePath: string, source: string): Promise<string> {
    return runPostCSS(this.root, source, filePath);
  }

  /** On-demand image optimization endpoint for development mode. */
  private async handleImageRequest(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    rawUrl: string,
  ): Promise<void> {
    const params = new URLSearchParams(rawUrl.split("?")[1] ?? "");
    const src = params.get("src") ?? "";
    const w = parseInt(params.get("w") ?? "0", 10) || undefined;
    const format = (params.get("format") ?? "webp") as ImageFormat;
    const q = parseInt(params.get("q") ?? "80", 10) || 80;

    const ALLOWED_FORMATS: ImageFormat[] = ["webp", "avif", "jpeg", "png"];
    if (!ALLOWED_FORMATS.includes(format)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unsupported format" }));
      return;
    }

    // Security: reject path traversal or absolute paths
    if (!src.startsWith("/") || src.includes("..") || path.isAbsolute(src.slice(1))) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid src" }));
      return;
    }

    // Check sharp availability
    if (!(await isSharpAvailable())) {
      res.writeHead(501, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Image optimization unavailable: sharp is not installed. Run: npm install sharp",
        })
      );
      return;
    }

    // Resolve file path: try public/{src} first, then root/{src}
    const publicDir = this.config?.build?.publicDir ?? "public";
    const publicPath = path.join(this.root, publicDir, src);
    const rootPath = path.join(this.root, src);
    const resolvedPath = fs.existsSync(publicPath) ? publicPath : rootPath;

    if (!fs.existsSync(resolvedPath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Image not found" }));
      return;
    }

    const cacheKey = `${resolvedPath}|${w ?? ""}|${format}|${q}`;
    const now = Date.now();
    const cached = this.imageCache.get(cacheKey);

    let buffer: Buffer;
    let outFormat: ImageFormat;

    if (cached && cached.expiresAt > now) {
      buffer = cached.buffer;
      outFormat = cached.format;
    } else {
      try {
        const result = await optimizeImage(resolvedPath, { width: w, format, quality: q });
        buffer = result.buffer;
        outFormat = result.format;
        this.imageCache.set(cacheKey, {
          buffer,
          format: outFormat,
          expiresAt: now + 60_000, // 60 second TTL
        });
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (err as Error).message }));
        return;
      }
    }

    res.writeHead(200, {
      "Content-Type": `image/${outFormat}`,
      "Content-Length": buffer.length,
      "Cache-Control": "public, max-age=60",
    });
    res.end(buffer);
  }

  /**
   * Resolve a URL path to a file inside the configured public/ directory.
   * Returns the absolute file path if it exists, null otherwise.
   */
  private resolvePublicFilePath(urlPath: string): string | null {
    const publicDir = this.config?.build?.publicDir ?? "public";
    const candidate = path.join(this.root, publicDir, urlPath);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
    return null;
  }

  /**
   * Serve a file from the public/ directory.
   * Reads as a Buffer so binary files (images, fonts, etc.) are handled correctly.
   */
  private servePublicFile(res: http.ServerResponse, filePath: string): void {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = this.getContentType(ext);
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": content.length,
      "Cache-Control": "public, max-age=3600",
    });
    res.end(content);
  }

  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".mjs": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
      ".eot": "application/vnd.ms-fontobject",
    };
    return types[ext] || "text/plain";
  }

  // ── Dashboard HTML (unchanged) ──────────────────────────────────────────────

  private getDashboardHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pyra.js Build Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #0a0a0a; color: #e0e0e0; line-height: 1.6; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header { background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%); padding: 30px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 4px 20px rgba(255, 107, 53, 0.3); }
    h1 { font-size: 2.5rem; font-weight: 700; margin-bottom: 10px; }
    .subtitle { font-size: 1.1rem; opacity: 0.9; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 25px; }
    .stat-label { font-size: 0.9rem; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
    .stat-value { font-size: 2.5rem; font-weight: 700; color: #ff6b35; }
    .stat-unit { font-size: 1.2rem; color: #aaa; margin-left: 5px; }
    .section { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 25px; margin-bottom: 25px; }
    .section-title { font-size: 1.5rem; font-weight: 600; margin-bottom: 20px; color: #ff6b35; }
    .empty-state { text-align: center; padding: 60px 20px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Pyra.js Build Dashboard</h1>
      <div class="subtitle">Real-time build metrics and performance analytics</div>
    </header>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Latest Build</div><div class="stat-value" id="latestBuildTime">--<span class="stat-unit">ms</span></div></div>
      <div class="stat-card"><div class="stat-label">Average Build Time</div><div class="stat-value" id="avgBuildTime">--<span class="stat-unit">ms</span></div></div>
      <div class="stat-card"><div class="stat-label">Total Builds</div><div class="stat-value" id="totalBuilds">--</div></div>
      <div class="stat-card"><div class="stat-label">Bundle Size</div><div class="stat-value" id="bundleSize">--<span class="stat-unit">KB</span></div></div>
    </div>
    <div class="section">
      <div class="section-title">Build History</div>
      <div id="buildHistoryChart" class="empty-state">No build history yet</div>
    </div>
  </div>
  <script>
    async function fetchMetrics() {
      try {
        const response = await fetch('/_pyra/api/metrics');
        const data = await response.json();
        const s = data.summary;
        document.getElementById('latestBuildTime').innerHTML = s.latestBuild ? Math.round(s.latestBuild.totalDuration) + '<span class="stat-unit">ms</span>' : '--<span class="stat-unit">ms</span>';
        document.getElementById('avgBuildTime').innerHTML = Math.round(s.averageBuildTime) + '<span class="stat-unit">ms</span>';
        document.getElementById('totalBuilds').textContent = s.totalBuilds;
        document.getElementById('bundleSize').innerHTML = s.latestBuild ? (s.latestBuild.bundleSize / 1024).toFixed(1) + '<span class="stat-unit">KB</span>' : '--<span class="stat-unit">KB</span>';
      } catch(e) {}
    }
    fetchMetrics();
    setInterval(fetchMetrics, 2000);
  </script>
</body>
</html>`;
  }

  // ── Server lifecycle ────────────────────────────────────────────────────────

  async start(): Promise<DevServerResult> {
    const startTime = performance.now();
    const warnings: string[] = [];
    let ssrEnabled = false;

    // v0.2: If adapter is configured, scan routes and build the router
    if (this.adapter && this.routesDir) {
      if (!fs.existsSync(this.routesDir)) {
        warnings.push(`Routes directory not found: ${this.routesDir}`);
        warnings.push("Route-aware SSR is disabled. Create src/routes/ to enable it.");
      } else {
        await this.buildRouteGraph();
        ssrEnabled = true;
      }
    }

    return new Promise((resolve, reject) => {
      this.server.on("error", (error: NodeJS.ErrnoException) => {
        reject(error);
      });

      this.server.listen(this.port, () => {
        this.setupFileWatcher();

        resolve({
          port: this.port,
          host: "localhost",
          protocol: "http",
          ssr: ssrEnabled,
          adapterName: this.adapter?.name,
          pageRouteCount: this.router?.pageRoutes().length ?? 0,
          apiRouteCount: this.router?.apiRoutes().length ?? 0,
          warnings,
          startupMs: performance.now() - startTime,
        });
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.clients.forEach((client) => client.close());
      this.clients.clear();

      this.wss.close(() => {
        if (this.watcher) {
          this.watcher.close().then(() => {
            this.server.close(() => {
              log.info("Dev server stopped");
              resolve();
            });
          });
        } else {
          this.server.close(() => {
            log.info("Dev server stopped");
            resolve();
          });
        }
      });
    });
  }
}
