import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { ImageFormat } from "pyrajs-shared";
import { performance } from "node:perf_hooks";
import { WebSocketServer, WebSocket } from "ws";
import type { FSWatcher } from "chokidar";
import { log } from "pyrajs-shared";
import type {
  PyraConfig,
  PyraAdapter,
  RouteGraph,
  DevServerResult,
  RouteMatch,
} from "pyrajs-shared";
import { runMiddleware } from "../middleware.js";
import {
  bundleFile,
  getCSSOutput,
} from "../bundler.js";
import { applyCORS } from "../cors.js";
import { metricsStore } from "../metrics.js";
import { createRequestContext, getSetCookieHeaders } from "../request-context.js";
import { RequestTracer } from "../tracer.js";

// ── Extracted modules ─────────────────────────────────────────────────────────
import {
  compileForServer as _compileForServer,
  loadMiddlewareChain as _loadMiddlewareChain,
  sendWebResponse,
  type CompilerHost,
} from "./dev-compiler.js";
import {
  setupWebSocket,
  setupFileWatcher,
  injectHMRClient,
  getHMRClientScript,
  type HMRHost,
} from "./dev-hmr.js";
import { getDashboardHTML } from "./dev-dashboard.js";
import {
  handleImageRequest as _handleImageRequest,
  resolvePublicFilePath as _resolvePublicFilePath,
  servePublicFile as _servePublicFile,
  processCSS as _processCSS,
  injectEntryCSSLinks as _injectEntryCSSLinks,
  getContentType,
  type StaticHost,
} from "./dev-static.js";
import {
  handleApiRouteInner as _handleApiRouteInner,
  type ApiHost,
} from "./dev-api.js";
import {
  buildRouteGraph as _buildRouteGraph,
  type RoutesHost,
} from "./dev-routes.js";
import {
  renderErrorPage as _renderErrorPage,
  renderNotFoundPage as _renderNotFoundPage,
  getErrorHTML,
  type ErrorsHost,
} from "./dev-errors.js";
import {
  handlePageRouteInner as _handlePageRouteInner,
  type SSRHost,
} from "./dev-ssr.js";

export interface DevServerOptions {
  port?: number;
  root?: string;
  config?: PyraConfig;
  /** The UI framework adapter (e.g., React). Enables route-aware SSR. */
  adapter?: PyraAdapter;
  /** Absolute path to the routes directory. Required if adapter is set. */
  routesDir?: string;
}

export class DevServer
  implements
    CompilerHost,
    HMRHost,
    StaticHost,
    ApiHost,
    RoutesHost,
    ErrorsHost,
    SSRHost
{
  private server: http.Server;
  private wss: WebSocketServer;
  // HMRHost — mutable, assigned by setupFileWatcher
  watcher: FSWatcher | null = null;
  clients: Set<WebSocket> = new Set();
  private port: number;
  root: string;

  // Route-aware SSR
  adapter: PyraAdapter | undefined;
  routesDir: string | undefined;
  // RoutesHost — mutable, assigned by buildRouteGraph
  router: RouteGraph | null = null;
  containerId: string;
  config: PyraConfig | undefined;
  serverCompileCache: Map<string, { outPath: string; timestamp: number }> =
    new Map();
  pyraTmpDir: string;
  // Verbose flag for static asset trace logging
  verbose: boolean;
  // v1.0: Error boundary files and 404 page (mutable via RoutesHost)
  errorFiles: Map<string, string> = new Map();
  notFoundPage: string | undefined;
  // v1.1: Image optimization cache (key: `path|width|format|quality`)
  imageCache: Map<
    string,
    { buffer: Buffer; format: ImageFormat; expiresAt: number }
  > = new Map();

  // ── Bound delegates ────────────────────────────────────────────────────────
  // These arrow properties satisfy the host interfaces that accept these
  // methods as callbacks (ApiHost.compileForServer, ErrorsHost.compileForServer,
  // SSRHost.compileForServer, HMRHost.buildRouteGraph).

  readonly compileForServer = (filePath: string) =>
    _compileForServer(this, filePath);

  readonly buildRouteGraph = () => _buildRouteGraph(this);

  // ── Constructor ────────────────────────────────────────────────────────────

  constructor(options: DevServerOptions = {}) {
    this.port = options.port || options.config?.port || 3000;
    this.root = options.root || process.cwd();
    this.adapter = options.adapter;
    this.routesDir = options.routesDir;
    this.containerId = options.config?.appContainerId || "app";
    this.config = options.config;
    this.pyraTmpDir = path.join(this.root, ".pyra", "server");
    this.verbose = false;

    // Configure trace buffer size
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
    setupWebSocket(this, this.wss);
  }

  // ── Request dispatcher ─────────────────────────────────────────────────────

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const url = req.url || "/";
    const method = req.method || "GET";

    // Remove query parameters
    const cleanUrl = url.split("?")[0];

    // Apply CORS headers early — before all other handlers so every response
    // path (routes, static files, internal endpoints) gets the headers.
    // Dev server defaults to cors: true (allow all) so cross-origin fetches
    // work out of the box during development (e.g. frontend on :3002 calling
    // an API on :3000). Set `server.cors: false` in pyra.config to disable,
    // or pass a CorsConfig object for fine-grained origin/method control.
    if (applyCORS(this.config?.server?.cors, req, res)) return;

    // Create tracer for every request in dev mode
    const tracer = new RequestTracer(method, cleanUrl);

    try {
      // ── Internal Pyra endpoints (no tracing) ────────────────────────────

      if (cleanUrl === "/__pyra_hmr_client") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(getHMRClientScript());
        return;
      }

      if (cleanUrl === "/_pyra") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(getDashboardHTML());
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
        const obj: Record<string, unknown> = {};
        for (const [key, val] of stats) {
          obj[key] = val;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
        return;
      }
      if (
        cleanUrl.startsWith("/_pyra/api/traces/") &&
        cleanUrl !== "/_pyra/api/traces/stats"
      ) {
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
        const hasImagePlugin = this.config?.plugins?.some(
          (p) => p.name === "pyra:images",
        );
        if (hasImagePlugin) {
          await _handleImageRequest(this, req, res, url);
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

        const compiled = await bundleFile(
          absolutePath,
          this.root,
          this.config?.resolve,
        );
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
      const publicFilePath = _resolvePublicFilePath(this, cleanUrl);
      if (publicFilePath) {
        _servePublicFile(this, res, publicFilePath);
        return;
      }

      // ── Route-aware SSR pipeline ─────────────────────────────────────────

      if (this.adapter && this.router) {
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
          const chain = await _loadMiddlewareChain(
            this,
            match.route.middlewarePaths,
          );

          let response: Response;
          try {
            // Run middleware → route handler (with tracing)
            response = await runMiddleware(chain, ctx, async () => {
              if (match.route.type === "api") {
                return _handleApiRouteInner(this, req, ctx, match, tracer);
              }
              return _handlePageRouteInner(
                this,
                req,
                ctx,
                cleanUrl,
                match,
                tracer,
              );
            });
          } catch (pipelineError) {
            // v1.0: Catch errors from middleware/load/render and render error boundary
            response = await _renderErrorPage(
              this,
              req,
              cleanUrl,
              pipelineError,
              match.route,
              match,
              tracer,
            );
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

          await sendWebResponse(res, tracedResponse);
          const setCookies = getSetCookieHeaders(ctx);
          for (const cookie of setCookies) {
            res.appendHeader("Set-Cookie", cookie);
          }

          // Close out the HMR build if one is active.
          if (metricsStore.isActiveBuild()) metricsStore.finishBuild();

          return;
        }

        // No route matched — render custom 404 page or default
        const notFoundResponse = await _renderNotFoundPage(
          this,
          req,
          cleanUrl,
          tracer,
        );
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
        await sendWebResponse(res, tracedResponse);
        return;
      }

      // ── Static file serving ──────────────────────────────────────────────

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
          const pub = _resolvePublicFilePath(this, cleanUrl);
          if (pub) {
            tracer.end();
            _servePublicFile(this, res, pub);
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
        content = await _processCSS(this, filePath, content);
        res.writeHead(200, {
          "Content-Type": "text/css",
          "Cache-Control": "no-cache",
        });
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
        if (this.verbose) {
          console.log(tracer.toDetailedLog(200));
        }
        return;
      }

      // Inject HMR client into HTML files
      if (ext === ".html") {
        content = injectHMRClient(content);
        // Eagerly bundle any <script type="module"> TS/JSX entry points so
        // their CSS ends up in cssOutputCache, then inject <link> tags so the
        // browser receives real stylesheets instead of nothing (fixes FOUC /
        // missing styles in SPA mode where index.html is served statically).
        content = await _injectEntryCSSLinks(this, filePath, content);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(content);
        if (this.verbose) {
          console.log(tracer.toDetailedLog(200));
        }
        return;
      }

      // Serve other files with appropriate content type
      const contentType = getContentType(ext);
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
      res.end(getErrorHTML(cleanUrl, error));
    }
  }

  // ── Server lifecycle ────────────────────────────────────────────────────────

  async start(): Promise<DevServerResult> {
    const startTime = performance.now();
    const warnings: string[] = [];
    let ssrEnabled = false;

    // If adapter is configured, scan routes and build the router
    if (this.adapter && this.routesDir) {
      if (!fs.existsSync(this.routesDir)) {
        warnings.push(`Routes directory not found: ${this.routesDir}`);
        warnings.push(
          "Route-aware SSR is disabled. Create src/routes/ to enable it.",
        );
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
        setupFileWatcher(this);

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
