/**
 * Simple static file server for opening HTML graphs
 */

import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { log } from 'pyrajs-shared';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export interface StaticServerOptions {
  root: string;
  port?: number;
  onReady?: (url: string) => void;
}

export class StaticServer {
  private server: Server | null = null;
  private port: number;
  private root: string;

  constructor(options: StaticServerOptions) {
    this.root = options.root;
    this.port = options.port || 0; // 0 = random available port
  }

  start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        const filePath = join(this.root, req.url === '/' ? 'index.html' : req.url || '');

        if (!existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }

        try {
          const content = readFileSync(filePath);
          const ext = extname(filePath);
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';

          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      });

      this.server.listen(this.port, () => {
        const address = this.server!.address();
        const port = typeof address === 'object' ? address?.port : this.port;
        const url = `http://localhost:${port}`;
        resolve(url);
      });

      this.server.on('error', reject);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

/**
 * Open URL in default browser
 */
export async function openBrowser(url: string): Promise<void> {
  const { spawn } = await import('node:child_process');
  const platform = process.platform;

  let command: string;
  let args: string[];

  if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  try {
    spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } catch (error) {
    log.warn(`Failed to open browser: ${error}`);
    log.info(`Please open manually: ${url}`);
  }
}
