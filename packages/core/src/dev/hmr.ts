import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import chokidar, { type FSWatcher } from "chokidar";
import { log } from "pyrajs-shared";
import { invalidateDependentCache } from "../bundler.js";
import { metricsStore } from "../metrics.js";

// ── HMRHost ───────────────────────────────────────────────────────────────────

export interface HMRHost {
  root: string;
  routesDir: string | undefined;
  clients: Set<WebSocket>;
  watcher: FSWatcher | null;
  serverCompileCache: Map<string, { outPath: string; timestamp: number }>;
  buildRouteGraph(): Promise<void>;
}

// ── setupWebSocket ────────────────────────────────────────────────────────────

/**
 * Wire up WebSocket connection tracking so HMR reload messages can be
 * broadcast to all connected browser tabs.
 */
export function setupWebSocket(host: HMRHost, wss: WebSocketServer): void {
  wss.on("connection", (ws: WebSocket) => {
    host.clients.add(ws);
    log.info("HMR client connected");

    ws.on("close", () => {
      host.clients.delete(ws);
    });
  });
}

// ── setupFileWatcher ──────────────────────────────────────────────────────────

/**
 * Watch the project root for file changes. On change/add:
 * - Invalidates the bundler and server-compile caches for the changed file.
 * - Rebuilds the route graph if a route file was added or changed.
 * - Broadcasts a "reload" message to all HMR clients.
 */
export function setupFileWatcher(host: HMRHost): void {
  host.watcher = chokidar.watch(host.root, {
    ignored: /(^|[/\\])(\.|node_modules)/,
    ignoreInitial: true,
    persistent: true,
  });

  host.watcher.on("change", async (filePath: string) => {
    const relativePath = path.relative(host.root, filePath);
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
    host.serverCompileCache.delete(filePath);

    // If a route file changed and we have a router, rebuild the route graph
    if (host.routesDir && filePath.startsWith(host.routesDir)) {
      const basename = path.basename(filePath);
      if (
        basename.startsWith("page.") ||
        basename.startsWith("route.") ||
        basename.startsWith("layout.") ||
        basename.startsWith("middleware.")
      ) {
        await host.buildRouteGraph();
      }
    }

    metricsStore.addHMREvent({
      type: "reload",
      file: relativePath,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
    });

    notifyClients(host, "reload");
  });

  host.watcher.on("add", async (filePath: string) => {
    const relativePath = path.relative(host.root, filePath);
    log.info(`File added: ${relativePath}`);

    if (metricsStore.isActiveBuild()) metricsStore.finishBuild();
    metricsStore.startBuild();

    const startTime = Date.now();

    invalidateDependentCache(filePath);

    // If a new route file was added, rebuild the route graph
    if (host.routesDir && filePath.startsWith(host.routesDir)) {
      const basename = path.basename(filePath);
      if (basename.startsWith("page.") || basename.startsWith("route.")) {
        await host.buildRouteGraph();
      }
    }

    metricsStore.addHMREvent({
      type: "reload",
      file: relativePath,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
    });

    notifyClients(host, "reload");
  });
}

// ── notifyClients ─────────────────────────────────────────────────────────────

/** Broadcast a JSON message to every open HMR WebSocket connection. */
export function notifyClients(host: HMRHost, type: string): void {
  host.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type }));
    }
  });
}

// ── injectHMRClient ───────────────────────────────────────────────────────────

/**
 * Inject the HMR client `<script>` tag into an HTML string.
 * Pure function — no host dependency.
 */
export function injectHMRClient(html: string): string {
  const script = `<script type="module" src="/__pyra_hmr_client"></script>`;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${script}\n</head>`);
  }
  if (html.includes("</body>")) {
    return html.replace("</body>", `${script}\n</body>`);
  }
  return html + script;
}

// ── getHMRClientScript ────────────────────────────────────────────────────────

/**
 * Return the browser-side HMR WebSocket listener script.
 * Pure function — no host dependency.
 */
export function getHMRClientScript(): string {
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
