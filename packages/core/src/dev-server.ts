import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import chokidar, { type FSWatcher } from 'chokidar';
import { log } from 'pyrajs-shared';
import { transformFile } from './transform.js';
import { bundleFile, invalidateDependentCache } from './bundler.js';
import type { PyraConfig } from 'pyrajs-shared';
import { metricsStore } from './metrics.js';

export interface DevServerOptions {
  port?: number;
  root?: string;
  config?: PyraConfig;
}

export class DevServer {
  private server: http.Server;
  private wss: WebSocketServer;
  private watcher: FSWatcher | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number;
  private root: string;

  constructor(options: DevServerOptions = {}) {
    this.port = options.port || options.config?.port || 3000;
    this.root = options.root || process.cwd();

    // Create HTTP server
    this.server = http.createServer(this.handleRequest.bind(this));

    // Create WebSocket server for HMR
    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocket();
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const url = req.url || '/';

    // Remove query parameters
    const cleanUrl = url.split('?')[0];

    try {
      // Handle HMR client script injection
      if (cleanUrl === '/__pyra_hmr_client') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(this.getHMRClientScript());
        return;
      }

      // Handle dashboard UI
      if (cleanUrl === '/_pyra') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getDashboardHTML());
        return;
      }

      // Handle dashboard API endpoints
      if (cleanUrl === '/_pyra/api/metrics') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          summary: metricsStore.getSummary(),
          latestBuild: metricsStore.getLatestBuild(),
          buildHistory: metricsStore.getBuildHistory(20),
          hmrHistory: metricsStore.getHMRHistory(50),
          dependencyGraph: metricsStore.getDependencyGraph(),
        }));
        return;
      }

      // Handle dashboard WebSocket endpoint for live updates
      if (cleanUrl === '/_pyra/ws') {
        // This is handled by the WebSocket server
        return;
      }

      // Resolve file path
      let filePath = path.join(this.root, cleanUrl === '/' ? '/index.html' : cleanUrl);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        // Try adding .html extension
        if (fs.existsSync(filePath + '.html')) {
          filePath = filePath + '.html';
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
      }

      // Check if it's a directory, serve index.html
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        if (!fs.existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
      }

      // Read file
      let content = fs.readFileSync(filePath, 'utf-8');
      const ext = path.extname(filePath);

      // Bundle and transform TypeScript/JSX files with module resolution
      if (/\.(tsx?|jsx?|mjs)$/.test(ext)) {
        content = await bundleFile(filePath, this.root);
        res.writeHead(200, {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'no-cache'
        });
        res.end(content);
        return;
      }

      // Inject HMR client into HTML files
      if (ext === '.html') {
        content = this.injectHMRClient(content);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
        return;
      }

      // Serve other files with appropriate content type
      const contentType = this.getContentType(ext);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.css' || ext === '.js' ? 'no-cache' : 'public, max-age=31536000'
      });
      res.end(content);

    } catch (error) {
      log.error(`Error serving ${cleanUrl}: ${error}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error');
    }
  }

  /**
   * Set up WebSocket for HMR
   */
  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      log.info('HMR client connected');

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });
  }

  /**
   * Set up file watcher
   */
  private setupFileWatcher(): void {
    this.watcher = chokidar.watch(this.root, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      ignoreInitial: true,
      persistent: true,
    });

    this.watcher.on('change', (filePath: string) => {
      const relativePath = path.relative(this.root, filePath);
      log.info(`File changed: ${relativePath}`);

      const startTime = Date.now();

      // Invalidate bundle cache for changed files
      invalidateDependentCache(filePath);

      // Track HMR event
      metricsStore.addHMREvent({
        type: 'reload',
        file: relativePath,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
      });

      this.notifyClients('reload');
    });

    this.watcher.on('add', (filePath: string) => {
      const relativePath = path.relative(this.root, filePath);
      log.info(`File added: ${relativePath}`);

      const startTime = Date.now();

      // Invalidate bundle cache for new files
      invalidateDependentCache(filePath);

      // Track HMR event
      metricsStore.addHMREvent({
        type: 'reload',
        file: relativePath,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
      });

      this.notifyClients('reload');
    });
  }

  /**
   * Notify all connected clients
   */
  private notifyClients(type: string): void {
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type }));
      }
    });
  }

  /**
   * Inject HMR client script into HTML
   */
  private injectHMRClient(html: string): string {
    const script = `<script type="module" src="/__pyra_hmr_client"></script>`;

    // Try to inject before </head>
    if (html.includes('</head>')) {
      return html.replace('</head>', `${script}\n</head>`);
    }

    // Try to inject before </body>
    if (html.includes('</body>')) {
      return html.replace('</body>', `${script}\n</body>`);
    }

    // Otherwise, append to the end
    return html + script;
  }

  /**
   * Get HMR client script
   */
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

  /**
   * Get content type based on file extension
   */
  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject',
    };

    return types[ext] || 'text/plain';
  }

  /**
   * Get dashboard HTML page
   */
  private getDashboardHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pyra.js Build Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      line-height: 1.6;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
    }

    header {
      background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 30px;
      box-shadow: 0 4px 20px rgba(255, 107, 53, 0.3);
    }

    h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 15px;
    }

    .logo {
      font-size: 3rem;
    }

    .subtitle {
      font-size: 1.1rem;
      opacity: 0.9;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .stat-card {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 25px;
      transition: all 0.3s ease;
    }

    .stat-card:hover {
      transform: translateY(-5px);
      border-color: #ff6b35;
      box-shadow: 0 8px 25px rgba(255, 107, 53, 0.2);
    }

    .stat-label {
      font-size: 0.9rem;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }

    .stat-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: #ff6b35;
    }

    .stat-unit {
      font-size: 1.2rem;
      color: #aaa;
      margin-left: 5px;
    }

    .section {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 25px;
    }

    .section-title {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 20px;
      color: #ff6b35;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .file-list {
      display: grid;
      gap: 12px;
    }

    .file-item {
      background: #0f0f0f;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
      padding: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.2s ease;
    }

    .file-item:hover {
      border-color: #ff6b35;
      background: #151515;
    }

    .file-name {
      font-family: "Courier New", monospace;
      color: #4fc3f7;
      font-size: 0.95rem;
    }

    .file-stats {
      display: flex;
      gap: 20px;
      align-items: center;
    }

    .file-stat {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
    }

    .file-stat .label {
      color: #888;
    }

    .file-stat .value {
      color: #fff;
      font-weight: 600;
    }

    .time-fast {
      color: #4caf50 !important;
    }

    .time-medium {
      color: #ff9800 !important;
    }

    .time-slow {
      color: #f44336 !important;
    }

    .hmr-events {
      max-height: 400px;
      overflow-y: auto;
    }

    .hmr-event {
      background: #0f0f0f;
      border-left: 3px solid #ff6b35;
      padding: 12px 15px;
      margin-bottom: 10px;
      border-radius: 4px;
      font-family: "Courier New", monospace;
      font-size: 0.9rem;
    }

    .hmr-event .timestamp {
      color: #888;
      font-size: 0.85rem;
    }

    .hmr-event .file {
      color: #4fc3f7;
      margin: 5px 0;
    }

    .hmr-event .type {
      display: inline-block;
      background: #ff6b35;
      color: #fff;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .chart-container {
      height: 300px;
      background: #0f0f0f;
      border-radius: 8px;
      padding: 20px;
      display: flex;
      align-items: flex-end;
      gap: 10px;
      overflow-x: auto;
    }

    .chart-bar {
      flex: 1;
      min-width: 40px;
      background: linear-gradient(to top, #ff6b35, #f7931e);
      border-radius: 4px 4px 0 0;
      position: relative;
      transition: all 0.3s ease;
      cursor: pointer;
    }

    .chart-bar:hover {
      opacity: 0.8;
      transform: scaleX(1.1);
    }

    .chart-bar .tooltip {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background: #000;
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.85rem;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
      margin-bottom: 5px;
    }

    .chart-bar:hover .tooltip {
      opacity: 1;
    }

    .live-indicator {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #1a1a1a;
      padding: 8px 15px;
      border-radius: 20px;
      font-size: 0.9rem;
      margin-left: auto;
    }

    .live-dot {
      width: 8px;
      height: 8px;
      background: #4caf50;
      border-radius: 50%;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #666;
    }

    .empty-state-icon {
      font-size: 4rem;
      margin-bottom: 20px;
      opacity: 0.5;
    }

    ::-webkit-scrollbar {
      width: 8px;
    }

    ::-webkit-scrollbar-track {
      background: #0a0a0a;
    }

    ::-webkit-scrollbar-thumb {
      background: #333;
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: #444;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>
        <span class="logo">🔥</span>
        Pyra.js Build Dashboard
      </h1>
      <div class="subtitle">Real-time build metrics and performance analytics</div>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Latest Build</div>
        <div class="stat-value" id="latestBuildTime">--<span class="stat-unit">ms</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Average Build Time</div>
        <div class="stat-value" id="avgBuildTime">--<span class="stat-unit">ms</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Builds</div>
        <div class="stat-value" id="totalBuilds">--</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Bundle Size</div>
        <div class="stat-value" id="bundleSize">--<span class="stat-unit">KB</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">
        📊 Build History
        <div class="live-indicator">
          <span class="live-dot"></span>
          Live
        </div>
      </div>
      <div class="chart-container" id="buildHistoryChart"></div>
    </div>

    <div class="section">
      <div class="section-title">📦 File Compilation Times</div>
      <div class="file-list" id="fileList"></div>
    </div>

    <div class="section">
      <div class="section-title">🔥 Hot Module Replacement Events</div>
      <div class="hmr-events" id="hmrEvents"></div>
    </div>
  </div>

  <script>
    // Fetch and display metrics
    async function fetchMetrics() {
      try {
        const response = await fetch('/_pyra/api/metrics');
        const data = await response.json();
        updateDashboard(data);
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      }
    }

    function updateDashboard(data) {
      // Update summary stats
      const summary = data.summary;
      document.getElementById('latestBuildTime').innerHTML =
        summary.latestBuild
          ? \`\${Math.round(summary.latestBuild.totalDuration)}<span class="stat-unit">ms</span>\`
          : '--<span class="stat-unit">ms</span>';

      document.getElementById('avgBuildTime').innerHTML =
        \`\${Math.round(summary.averageBuildTime)}<span class="stat-unit">ms</span>\`;

      document.getElementById('totalBuilds').textContent = summary.totalBuilds;

      document.getElementById('bundleSize').innerHTML =
        summary.latestBuild
          ? \`\${(summary.latestBuild.bundleSize / 1024).toFixed(1)}<span class="stat-unit">KB</span>\`
          : '--<span class="stat-unit">KB</span>';

      // Update build history chart
      updateBuildHistoryChart(data.buildHistory);

      // Update file list
      updateFileList(summary.latestBuild?.files || []);

      // Update HMR events
      updateHMREvents(data.hmrHistory);
    }

    function updateBuildHistoryChart(history) {
      const container = document.getElementById('buildHistoryChart');

      if (!history || history.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><p>No build history yet</p></div>';
        return;
      }

      const maxDuration = Math.max(...history.map(b => b.totalDuration));

      container.innerHTML = history.map(build => {
        const height = (build.totalDuration / maxDuration) * 100;
        const date = new Date(build.timestamp);
        return \`
          <div class="chart-bar" style="height: \${height}%">
            <div class="tooltip">
              \${Math.round(build.totalDuration)}ms<br>
              \${date.toLocaleTimeString()}
            </div>
          </div>
        \`;
      }).join('');
    }

    function updateFileList(files) {
      const container = document.getElementById('fileList');

      if (!files || files.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><p>No files compiled yet</p></div>';
        return;
      }

      container.innerHTML = files.map(file => {
        const timeClass = file.compileTime < 10 ? 'time-fast' :
                          file.compileTime < 50 ? 'time-medium' : 'time-slow';

        return \`
          <div class="file-item">
            <div class="file-name">📦 \${file.path}</div>
            <div class="file-stats">
              <div class="file-stat">
                <span class="label">Time:</span>
                <span class="value \${timeClass}">\${file.compileTime.toFixed(1)}ms</span>
              </div>
              <div class="file-stat">
                <span class="label">Size:</span>
                <span class="value">\${(file.size / 1024).toFixed(1)}KB</span>
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    function updateHMREvents(events) {
      const container = document.getElementById('hmrEvents');

      if (!events || events.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔥</div><p>No HMR events yet</p></div>';
        return;
      }

      container.innerHTML = events.reverse().map(event => {
        const date = new Date(event.timestamp);
        return \`
          <div class="hmr-event">
            <div><span class="type">\${event.type}</span></div>
            <div class="file">\${event.file}</div>
            <div class="timestamp">\${date.toLocaleTimeString()}</div>
          </div>
        \`;
      }).join('');
    }

    // Initial fetch
    fetchMetrics();

    // Auto-refresh every 2 seconds
    setInterval(fetchMetrics, 2000);

    // Page title update
    document.title = '🔥 Pyra.js Dashboard';
  </script>
</body>
</html>`;
  }

  /**
   * Start the dev server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Handle server errors (like port already in use)
      this.server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          log.error(`Port ${this.port} is already in use.`);
          log.info(`Try using a different port: pyra dev -p ${this.port + 1}`);
          reject(error);
        } else {
          log.error(`Server error: ${error.message}`);
          reject(error);
        }
      });

      this.server.listen(this.port, () => {
        log.success(`Dev server running at http://localhost:${this.port}`);
        log.info('Watching for file changes...');

        // Set up file watcher after server starts
        this.setupFileWatcher();

        resolve();
      });
    });
  }

  /**
   * Stop the dev server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all WebSocket connections
      this.clients.forEach((client) => {
        client.close();
      });
      this.clients.clear();

      // Close WebSocket server
      this.wss.close(() => {
        // Close file watcher
        if (this.watcher) {
          this.watcher.close().then(() => {
            // Close HTTP server
            this.server.close(() => {
              log.info('Dev server stopped');
              resolve();
            });
          });
        } else {
          // Close HTTP server
          this.server.close(() => {
            log.info('Dev server stopped');
            resolve();
          });
        }
      });
    });
  }
}
