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
 * Includes the error overlay — shown on compilation/runtime errors,
 * dismissed automatically when a successful update or reload arrives.
 * Pure function — no host dependency.
 */
export function getHMRClientScript(): string {
  return `
// Pyra.js HMR Client
(function() {

  // ── Error Overlay ────────────────────────────────────────────────────────

  var _overlay = null;

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showError(title, message, stack, file) {
    dismissError();

    var overlay = document.createElement('div');
    overlay.id = '__pyra-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'background:rgba(0,0,0,0.75)',
      'display:flex', 'align-items:flex-start', 'justify-content:center',
      'padding:48px 20px 20px', 'overflow-y:auto',
      'backdrop-filter:blur(3px)', '-webkit-backdrop-filter:blur(3px)',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    ].join(';');

    var safeTitle   = _esc(title   || 'Build Error');
    var safeMessage = _esc(message || '');
    var safeFile    = file  ? _esc(file)  : '';
    var safeStack   = stack ? _esc(stack) : '';

    // Strip the redundant first line from the stack if it duplicates the message
    if (safeStack.indexOf(_esc(message)) === 0) {
      var firstNewline = safeStack.indexOf('\\n');
      if (firstNewline !== -1) safeStack = safeStack.slice(firstNewline + 1).trimStart().replace(/^\\n+/, '');
    }

    overlay.innerHTML =
      '<style>' +
        '#__pyra-overlay *{box-sizing:border-box}' +
        '#__pyra-overlay .p-card{' +
          'background:#111118;border:1px solid rgba(255,80,50,0.45);' +
          'border-radius:12px;padding:28px 28px 20px;' +
          'max-width:760px;width:100%;position:relative;' +
          'box-shadow:0 30px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(255,80,50,0.08);}' +
        '#__pyra-overlay .p-hdr{display:flex;align-items:center;gap:10px;margin-bottom:16px;}' +
        '#__pyra-overlay .p-badge{' +
          'background:#ff5032;color:#fff;font-size:10px;font-weight:700;' +
          'letter-spacing:.08em;padding:3px 9px;border-radius:4px;' +
          'text-transform:uppercase;flex-shrink:0;}' +
        '#__pyra-overlay .p-title{color:#ff7a60;font-size:13px;font-weight:600;}' +
        '#__pyra-overlay .p-close{' +
          'position:absolute;top:14px;right:14px;background:none;' +
          'border:1px solid rgba(255,255,255,0.12);color:#666;' +
          'width:26px;height:26px;border-radius:5px;cursor:pointer;' +
          'font-size:15px;line-height:1;display:flex;align-items:center;' +
          'justify-content:center;transition:color .15s,border-color .15s;}' +
        '#__pyra-overlay .p-close:hover{color:#fff;border-color:rgba(255,255,255,0.35);}' +
        '#__pyra-overlay .p-file{' +
          'background:rgba(79,195,247,0.07);border:1px solid rgba(79,195,247,0.18);' +
          'color:#4fc3f7;font-size:11px;padding:4px 10px;border-radius:4px;' +
          'margin-bottom:16px;display:inline-block;' +
          'max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
        '#__pyra-overlay .p-msg{' +
          'color:#e8e0d8;font-size:13px;line-height:1.65;' +
          'margin:0 0 14px;white-space:pre-wrap;word-break:break-word;}' +
        '#__pyra-overlay .p-stack{' +
          'background:#0b0b16;border:1px solid rgba(255,255,255,0.05);' +
          'border-left:3px solid rgba(255,80,50,0.6);' +
          'color:#666;font-size:11px;line-height:1.75;' +
          'padding:14px 16px;border-radius:6px;' +
          'overflow-x:auto;white-space:pre;margin:0;}' +
        '#__pyra-overlay .p-hint{' +
          'margin-top:14px;font-size:10px;color:#3a3a4a;text-align:right;}' +
      '</style>' +
      '<div class="p-card">' +
        '<button class="p-close" id="__pyra-close" aria-label="Dismiss">\xd7</button>' +
        '<div class="p-hdr">' +
          '<span class="p-badge">Error</span>' +
          '<span class="p-title">' + safeTitle + '</span>' +
        '</div>' +
        (safeFile ? '<div class="p-file">' + safeFile + '</div>' : '') +
        '<pre class="p-msg">' + safeMessage + '</pre>' +
        (safeStack ? '<pre class="p-stack">' + safeStack + '</pre>' : '') +
        '<p class="p-hint">Fix the error above to dismiss automatically &nbsp;&bull;&nbsp; <kbd>Esc</kbd> to close</p>' +
      '</div>';

    document.body.appendChild(overlay);
    _overlay = overlay;

    document.getElementById('__pyra-close').onclick = dismissError;
    function onKey(e) { if (e.key === 'Escape') dismissError(); }
    overlay._onKey = onKey;
    document.addEventListener('keydown', onKey);
  }

  function dismissError() {
    if (_overlay) {
      if (_overlay._onKey) document.removeEventListener('keydown', _overlay._onKey);
      _overlay.remove();
      _overlay = null;
    }
  }

  // ── WebSocket ────────────────────────────────────────────────────────────

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const ws = new WebSocket(protocol + '//' + host);

  ws.addEventListener('open', () => {
    console.log('[pyra] HMR connected');
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'error') {
      showError(msg.title, msg.message, msg.stack, msg.file);
      return;
    }

    if (msg.type === 'update') {
      // React Fast Refresh: re-import all page modules with a cache-bust
      // timestamp then call performReactRefresh() to hot-update components
      // in place — component state is preserved.
      (async () => {
        const modules = window.__pyra_hmr_modules || [];
        if (!modules.length || !window.__pyra_refresh) {
          // No RFR support or no modules tracked — fall back to full reload.
          dismissError();
          window.location.reload();
          return;
        }
        const t = Date.now();
        try {
          await Promise.all(
            modules.map(url => import(url + '?__hmr=' + t))
          );
          dismissError();
          window.__pyra_refresh.performReactRefresh();
          console.log('[pyra] Fast Refresh \u21bb');
        } catch (err) {
          // Import failed — the server sends a throw-module when bundling
          // fails, so err.message contains the actual compilation error.
          console.error('[pyra] Fast Refresh failed:', err);
          showError('Compilation Error', err.message, err.stack, null);
        }
      })();
      return;
    }

    if (msg.type === 'reload') {
      dismissError();
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
