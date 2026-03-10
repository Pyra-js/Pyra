import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import chokidar, { type FSWatcher } from "chokidar";
import { log } from "@pyra-js/shared";
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

// ── canFastRefresh ────────────────────────────────────────────────────────────

/**
 * Returns true when a changed file can be updated via React Fast Refresh
 * instead of a full page reload.
 *
 * Rules:
 * - Must be a JS/TS file (CSS, JSON, images always need reload).
 * - Server-only route files (route.*, middleware.*) run in Node — the browser
 *   has no module to update, so they still need a full reload.
 */
function canFastRefresh(filePath: string, routesDir?: string): boolean {
  if (!/\.[jt]sx?$/.test(path.extname(filePath))) return false;

  if (routesDir && filePath.startsWith(routesDir)) {
    const basename = path.basename(filePath);
    if (basename.startsWith("route.") || basename.startsWith("middleware.")) {
      return false;
    }
  }

  return true;
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
        try {
          await host.buildRouteGraph();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const stack = err instanceof Error ? err.stack : undefined;
          notifyError(host, "Route Scan Error", message, stack, relativePath);
          log.error(`Route scan failed: ${message}`);
        }
      }
    }

    // Decide update strategy:
    // - JS/TS files that are NOT server-only → "update" (React Fast Refresh)
    // - Everything else (CSS, config, route.ts, middleware.ts) → "reload"
    const hmrType = canFastRefresh(filePath, host.routesDir) ? "update" : "reload";

    metricsStore.addHMREvent({
      type: hmrType,
      file: relativePath,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
    });

    notifyClients(host, hmrType);
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
        try {
          await host.buildRouteGraph();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const stack = err instanceof Error ? err.stack : undefined;
          notifyError(host, "Route Scan Error", message, stack, relativePath);
          log.error(`Route scan failed: ${message}`);
        }
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

/**
 * Broadcast a build/runtime error to all connected HMR clients so the
 * in-browser error overlay is shown with the full error details.
 */
export function notifyError(
  host: HMRHost,
  title: string,
  message: string,
  stack?: string,
  file?: string,
): void {
  host.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "error", title, message, stack, file }));
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
    const msg = JSON.parse(event.data);

    if (msg.type === 'update') {
      // React Fast Refresh: re-import all page modules with a cache-bust
      // timestamp then call performReactRefresh() to hot-update components
      // in place — component state is preserved.
      (async () => {
        const modules = window.__pyra_hmr_modules || [];
        if (!modules.length || !window.__pyra_refresh) {
          // No RFR support or no modules tracked — fall back to full reload.
          window.location.reload();
          return;
        }
        const t = Date.now();
        try {
          await Promise.all(
            modules.map(url => import(url + '?__hmr=' + t))
          );
          window.__pyra_refresh.performReactRefresh();
          console.log('[pyra] Fast Refresh \u21bb');
        } catch (err) {
          console.error('[pyra] Fast Refresh failed, falling back to reload', err);
          window.location.reload();
        }
      })();
      return;
    }

    if (msg.type === 'reload') {
      console.log('[pyra] Reloading...');
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
