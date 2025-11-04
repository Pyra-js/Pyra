import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import chokidar, { type FSWatcher } from 'chokidar';
import { log } from '@pyra/shared';
import { transformFile } from './transform.js';
import { bundleFile, invalidateDependentCache } from './bundler.js';
import type { PyraConfig } from '@pyra/shared';

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

      // Invalidate bundle cache for changed files
      invalidateDependentCache(filePath);

      this.notifyClients('reload');
    });

    this.watcher.on('add', (filePath: string) => {
      const relativePath = path.relative(this.root, filePath);
      log.info(`File added: ${relativePath}`);

      // Invalidate bundle cache for new files
      invalidateDependentCache(filePath);

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
