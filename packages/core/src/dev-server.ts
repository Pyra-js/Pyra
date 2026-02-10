import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import chokidar, { type FSWatcher } from "chokidar";
import { log } from "pyrajs-shared";
import type { PyraConfig, PyraAdapter, RouteGraph, RenderContext, DevServerResult } from "pyrajs-shared";
import { bundleFile, invalidateDependentCache } from "./bundler.js";
import { metricsStore } from "./metrics.js";
import { scanRoutes } from "./scanner.js";
import { createRouter } from "./router.js";
import {
  createRequestContext,
  getSetCookieHeaders,
  escapeJsonForScript,
} from "./request-context.js";
import esbuild from "esbuild";

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
  private serverCompileCache: Map<string, { outPath: string; timestamp: number }> =
    new Map();
  private pyraTmpDir: string;

  constructor(options: DevServerOptions = {}) {
    this.port = options.port || options.config?.port || 3000;
    this.root = options.root || process.cwd();
    this.adapter = options.adapter;
    this.routesDir = options.routesDir;
    this.containerId = options.config?.appContainerId || "app";
    this.pyraTmpDir = path.join(this.root, ".pyra", "server");

    // Create HTTP server
    this.server = http.createServer(this.handleRequest.bind(this));

    // Create WebSocket server for HMR
    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on("error", () => {
      // Handled by the HTTP server's error listener (e.g. EADDRINUSE)
    });
    this.setupWebSocket();
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const url = req.url || "/";

    // Remove query parameters
    const cleanUrl = url.split("?")[0];

    try {
      // Handle HMR client script injection
      if (cleanUrl === "/__pyra_hmr_client") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(this.getHMRClientScript());
        return;
      }

      // Handle dashboard UI
      if (cleanUrl === "/_pyra") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(this.getDashboardHTML());
        return;
      }

      // Handle dashboard API endpoints
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

      // Handle dashboard WebSocket endpoint for live updates
      if (cleanUrl === "/_pyra/ws") {
        return;
      }

      // ── v0.2: Serve client-side module for hydration ──────────────────
      // Browser requests /__pyra/modules/<path> to get the compiled client
      // entry for a route (used by the hydration script).
      if (cleanUrl.startsWith("/__pyra/modules/")) {
        const modulePath = cleanUrl.slice("/__pyra/modules/".length);
        const absolutePath = path.resolve(this.root, modulePath);

        if (!fs.existsSync(absolutePath)) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Module not found");
          return;
        }

        const compiled = await bundleFile(absolutePath, this.root);
        res.writeHead(200, {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-cache",
        });
        res.end(compiled);
        return;
      }

      // ── v0.2: Route-aware SSR pipeline ────────────────────────────────
      if (this.adapter && this.router) {
        const match = this.router.match(cleanUrl);

        if (match) {
          if (match.route.type === "api") {
            // API routes are not implemented yet (v0.6)
            res.writeHead(501, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({ error: "API routes not yet implemented" }),
            );
            return;
          }

          // Page route → SSR pipeline
          await this.handlePageRoute(req, res, cleanUrl, match);
          return;
        }
        // No route matched — fall through to static file serving
      }

      // ── Static file serving (existing behavior) ───────────────────────
      let filePath = path.join(
        this.root,
        cleanUrl === "/" ? "/index.html" : cleanUrl,
      );

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        if (fs.existsSync(filePath + ".html")) {
          filePath = filePath + ".html";
        } else {
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
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("404 Not Found");
          return;
        }
      }

      // Read file
      let content = fs.readFileSync(filePath, "utf-8");
      const ext = path.extname(filePath);

      // Bundle and transform TypeScript/JSX files with module resolution
      if (/\.(tsx?|jsx?|mjs)$/.test(ext)) {
        content = await bundleFile(filePath, this.root);
        res.writeHead(200, {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-cache",
        });
        res.end(content);
        return;
      }

      // Inject HMR client into HTML files
      if (ext === ".html") {
        content = this.injectHMRClient(content);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(content);
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
    } catch (error) {
      log.error(`Error serving ${cleanUrl}: ${error}`);
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end(this.getErrorHTML(cleanUrl, error));
    }
  }

  // ── SSR Pipeline ────────────────────────────────────────────────────────────

  /**
   * Handle a matched page route: compile → import → render → shell → respond.
   *
   * This is the core SSR pipeline. Core never sees React — it passes
   * the opaque component to the adapter's renderToHTML().
   */
  private async handlePageRoute(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    match: import("pyrajs-shared").RouteMatch,
  ): Promise<void> {
    const { route, params } = match;
    const adapter = this.adapter!;

    // 1. Compile the route module for server (Node target, framework external)
    const serverModule = await this.compileForServer(route.filePath);

    // 2. Import the compiled module
    // Cache-bust by appending timestamp query to force re-import after recompile
    const moduleUrl =
      pathToFileURL(serverModule).href + `?t=${Date.now()}`;
    const mod = await import(moduleUrl);
    const component = mod.default;

    if (!component) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(
        `Route "${route.id}" (${route.filePath}) does not export a default component.`,
      );
      return;
    }

    // 3. Call load() if exported (v0.3)
    let data: unknown = null;
    if (typeof mod.load === "function") {
      const requestContext = createRequestContext({
        req,
        params,
        routeId: route.id,
        mode: "development",
      });

      const loadResult = await mod.load(requestContext);

      // If load() returns a Response, short-circuit the SSR pipeline
      if (loadResult instanceof Response) {
        await this.sendWebResponse(res, loadResult);

        // Also apply any Set-Cookie headers from the context
        const setCookies = getSetCookieHeaders(requestContext);
        for (const cookie of setCookies) {
          res.appendHeader("Set-Cookie", cookie);
        }
        return;
      }

      data = loadResult;

      // Apply Set-Cookie headers from the request context
      const setCookies = getSetCookieHeaders(requestContext);
      for (const cookie of setCookies) {
        res.appendHeader("Set-Cookie", cookie);
      }
    }

    // 4. Build RenderContext
    const headTags: string[] = [];
    const renderContext: RenderContext = {
      url: new URL(pathname, `http://${req.headers.host || "localhost"}`),
      params,
      pushHead(tag: string) {
        headTags.push(tag);
      },
    };

    // 5. Call adapter.renderToHTML() with load data
    const bodyHtml = await adapter.renderToHTML(component, data, renderContext);

    // 6. Get document shell
    const shell = adapter.getDocumentShell?.() || DEFAULT_SHELL;

    // 7. Build the client module URL for hydration
    const clientModulePath = path.relative(this.root, route.filePath);
    // Normalize to posix separators for URL
    const clientModuleUrl =
      "/__pyra/modules/" + clientModulePath.split(path.sep).join("/");

    // 8. Get hydration script from adapter
    const hydrationScript = adapter.getHydrationScript(
      clientModuleUrl,
      this.containerId,
    );

    // 9. Serialize data for client hydration
    // Merge load data + params so the client gets the same props as SSR
    const hydrationData: Record<string, unknown> = {};
    if (data && typeof data === "object") {
      Object.assign(hydrationData, data);
    }
    hydrationData.params = params;
    const serializedData = escapeJsonForScript(JSON.stringify(hydrationData));
    const dataScript = `<script id="__pyra_data" type="application/json">${serializedData}</script>`;

    // 10. Assemble the full HTML
    let html = shell;

    // Replace container ID placeholder if present
    html = html.replace("__CONTAINER_ID__", this.containerId);

    // Inject page body into the outlet
    html = html.replace("<!--pyra-outlet-->", bodyHtml);

    // Inject head tags
    const headContent = headTags.join("\n  ");
    html = html.replace("<!--pyra-head-->", headContent);

    // Inject data script, hydration script, and HMR client before </body>
    const scripts = [
      dataScript,
      `<script type="module">${hydrationScript}</script>`,
    ].join("\n  ");

    html = this.injectHMRClient(html);
    html = html.replace("</body>", `  ${scripts}\n</body>`);

    res.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-cache",
    });
    res.end(html);
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

    // Log the route table
    const pages = this.router.pageRoutes();
    const apis = this.router.apiRoutes();
    log.info(`Discovered ${pages.length} page routes, ${apis.length} API routes:`);
    for (const route of [...pages, ...apis]) {
      const type = route.type === "page" ? "page" : "api ";
      log.info(`  ${type}  ${route.pattern}`);
    }
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
