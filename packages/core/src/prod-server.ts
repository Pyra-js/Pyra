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
} from "pyrajs-shared";
import { HTTP_METHODS } from "pyrajs-shared";
import {
  createRequestContext,
  getSetCookieHeaders,
  escapeJsonForScript,
} from "./request-context.js";

// ─── Public API ──────────────────────────────────────────────────────────────

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

// ─── Manifest Matcher ────────────────────────────────────────────────────────

interface TrieNode {
  staticChildren: Map<string, TrieNode>;
  dynamicChild: { paramName: string; node: TrieNode } | null;
  catchAllChild: { paramName: string; entry: ManifestRouteEntry } | null;
  entry: ManifestRouteEntry | null;
}

interface MatchResult {
  entry: ManifestRouteEntry;
  params: Record<string, string>;
}

function createTrieNode(): TrieNode {
  return { staticChildren: new Map(), dynamicChild: null, catchAllChild: null, entry: null };
}

function splitSegments(value: string): string[] {
  if (value === "/") return [];
  const normalized =
    value.endsWith("/") && value !== "/" ? value.slice(0, -1) : value;
  return normalized.split("/").filter(Boolean);
}

/**
 * Build a trie from manifest route entries for efficient URL matching.
 */
function buildMatcher(
  routes: Record<string, ManifestRouteEntry>,
): { match(pathname: string): MatchResult | null } {
  const root = createTrieNode();

  // Insert each route's pattern into the trie
  for (const entry of Object.values(routes)) {
    const segments = splitSegments(entry.pattern);
    let current = root;
    let isCatchAll = false;

    for (const segment of segments) {
      if (segment.startsWith("*")) {
        // Catch-all segment — store on the current node and stop
        const paramName = segment.slice(1);
        current.catchAllChild = { paramName, entry };
        isCatchAll = true;
        break;
      } else if (segment.startsWith(":")) {
        const paramName = segment.slice(1);
        if (!current.dynamicChild) {
          current.dynamicChild = { paramName, node: createTrieNode() };
        }
        current = current.dynamicChild.node;
      } else {
        let child = current.staticChildren.get(segment);
        if (!child) {
          child = createTrieNode();
          current.staticChildren.set(segment, child);
        }
        current = child;
      }
    }

    if (!isCatchAll) {
      current.entry = entry;
    }
  }

  // Match function — static first, then dynamic, then catch-all (same as router.ts)
  function matchSegments(
    node: TrieNode,
    segments: string[],
    index: number,
    params: Record<string, string>,
  ): ManifestRouteEntry | null {
    if (index === segments.length) return node.entry;

    const segment = segments[index];

    // 1. Static first (highest priority)
    const staticChild = node.staticChildren.get(segment);
    if (staticChild) {
      const result = matchSegments(staticChild, segments, index + 1, params);
      if (result) return result;
    }

    // 2. Dynamic fallback (medium priority)
    if (node.dynamicChild) {
      const { paramName, node: dynamicNode } = node.dynamicChild;
      params[paramName] = segment;
      const result = matchSegments(dynamicNode, segments, index + 1, params);
      if (result) return result;
      delete params[paramName];
    }

    // 3. Catch-all (lowest priority) — consumes all remaining segments
    if (node.catchAllChild) {
      const { paramName, entry } = node.catchAllChild;
      params[paramName] = segments.slice(index).join("/");
      return entry;
    }

    return null;
  }

  return {
    match(pathname: string): MatchResult | null {
      const segments = splitSegments(pathname);
      const params: Record<string, string> = {};
      const entry = matchSegments(root, segments, 0, params);
      if (!entry) return null;
      return { entry, params };
    },
  };
}

// ─── ProdServer ──────────────────────────────────────────────────────────────

const DEFAULT_SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--pyra-head-->
</head>
<body>
  <div id="__CONTAINER_ID__"><!--pyra-outlet--></div>
</body>
</html>`;

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

  // ── Lifecycle ────────────────────────────────────────────────────────────

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
    return new Promise((resolve) => {
      this.server.close(() => {
        log.info("Production server stopped");
        resolve();
      });
    });
  }

  // ── Request handling ─────────────────────────────────────────────────────

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const url = req.url || "/";
    const cleanUrl = url.split("?")[0];

    try {
      // 1. Try serving static assets from dist/client/
      const staticPath = path.join(this.clientDir, cleanUrl);
      if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
        this.serveStaticFile(res, staticPath, cleanUrl);
        return;
      }

      // 2. Match against manifest routes
      const match = this.matcher.match(cleanUrl);

      if (!match) {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end(this.get404HTML(cleanUrl));
        return;
      }

      // 3. API routes
      if (match.entry.type === "api") {
        await this.handleApiRoute(req, res, match);
        return;
      }

      // 4. Prerendered page → serve static HTML directly
      if (match.entry.prerendered) {
        this.servePrerenderedPage(req, res, cleanUrl, match);
        return;
      }

      // 5. Dynamic SSR page route
      await this.handlePageRoute(req, res, cleanUrl, match);
    } catch (error) {
      log.error(`Error serving ${cleanUrl}: ${error}`);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  }

  // ── Static file serving ──────────────────────────────────────────────────

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

  // ── Prerendered Page Serving ─────────────────────────────────────────────

  private servePrerenderedPage(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    match: MatchResult,
  ): void {
    const { entry, params } = match;

    // For static prerendered pages, use the prerenderedFile path directly.
    // For dynamic prerendered pages (e.g., /blog/[slug] with multiple paths),
    // compute the concrete HTML path from the URL.
    let htmlRelPath: string;
    if (entry.prerenderedFile && !entry.prerenderedCount) {
      // Static: single prerendered file
      htmlRelPath = entry.prerenderedFile;
    } else {
      // Dynamic: build path from URL pathname
      htmlRelPath = pathname === "/"
        ? "index.html"
        : pathname.slice(1) + "/index.html";
    }

    const htmlAbsPath = path.join(this.clientDir, htmlRelPath);

    if (!fs.existsSync(htmlAbsPath)) {
      // Prerendered file missing — fall back to SSR (shouldn't happen normally)
      log.warn(`Prerendered file not found for ${pathname}: ${htmlAbsPath}`);
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end(this.get404HTML(pathname));
      return;
    }

    const content = fs.readFileSync(htmlAbsPath);
    const cacheControl = buildCacheControlHeader(entry.cache);

    res.writeHead(200, {
      "Content-Type": "text/html",
      "Content-Length": content.length,
      "Cache-Control": cacheControl,
    });
    res.end(content);
  }

  // ── API Route Handler ────────────────────────────────────────────────────

  private async handleApiRoute(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    match: MatchResult,
  ): Promise<void> {
    const { entry, params } = match;
    const method = (req.method || "GET").toUpperCase();

    // 1. Check if this method is available (from build-time export detection)
    const allowedMethods = entry.methods || [];
    if (!allowedMethods.includes(method)) {
      res.writeHead(405, {
        "Content-Type": "application/json",
        Allow: allowedMethods.join(", "),
      });
      res.end(
        JSON.stringify({
          error: `Method ${method} not allowed`,
          allowed: allowedMethods,
        }),
      );
      return;
    }

    // 2. Import the pre-built server entry
    if (!entry.serverEntry) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`API route "${entry.id}" has no server entry in the manifest.`);
      return;
    }

    const serverPath = path.join(this.serverDir, entry.serverEntry);
    const mod = await this.importModule(serverPath);

    if (typeof mod[method] !== "function") {
      // Shouldn't happen if build detected it, but handle gracefully
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`API route "${entry.id}" does not export a ${method} handler.`);
      return;
    }

    // 3. Build RequestContext
    const ctx = createRequestContext({
      req,
      params,
      routeId: entry.id,
      mode: "production",
      envPrefix: (this.config?.env?.prefix as string) || "PYRA_",
    });

    // 4. Call the handler
    const response: Response = await mod[method](ctx);

    // 5. Send the Response
    await this.sendWebResponse(res, response);

    // 6. Apply Set-Cookie headers
    for (const cookie of getSetCookieHeaders(ctx)) {
      res.appendHeader("Set-Cookie", cookie);
    }
  }

  // ── SSR Pipeline ─────────────────────────────────────────────────────────

  private async handlePageRoute(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    match: MatchResult,
  ): Promise<void> {
    const { entry, params } = match;

    // 1. Import the pre-built SSR module
    if (!entry.ssrEntry) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Route "${entry.id}" has no SSR entry in the manifest.`);
      return;
    }

    const ssrPath = path.join(this.serverDir, entry.ssrEntry);
    const mod = await this.importModule(ssrPath);

    // 2. Validate default export
    const component = mod.default;
    if (!component) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(
        `Route "${entry.id}" (${entry.ssrEntry}) does not export a default component.`,
      );
      return;
    }

    // 3. Call load() if present
    let data: unknown = null;
    if (entry.hasLoad && typeof mod.load === "function") {
      const ctx = createRequestContext({
        req,
        params,
        routeId: entry.id,
        mode: "production",
        envPrefix: (this.config?.env?.prefix as string) || "PYRA_",
      });

      const loadResult = await mod.load(ctx);

      // Short-circuit if load() returns a Response
      if (loadResult instanceof Response) {
        await this.sendWebResponse(res, loadResult);
        for (const cookie of getSetCookieHeaders(ctx)) {
          res.appendHeader("Set-Cookie", cookie);
        }
        return;
      }

      data = loadResult;

      // Apply Set-Cookie headers
      for (const cookie of getSetCookieHeaders(ctx)) {
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

    // 5. Render via adapter
    const bodyHtml = await this.adapter.renderToHTML(
      component,
      data,
      renderContext,
    );

    // 6. Get document shell
    const shell = this.adapter.getDocumentShell?.() || DEFAULT_SHELL;

    // 7. Build manifest-driven asset tags (per-route only)
    const assetTags = buildAssetTags(entry, this.manifest.base);

    // 8. Serialize data for client hydration
    const hydrationData: Record<string, unknown> = {};
    if (data && typeof data === "object") {
      Object.assign(hydrationData, data);
    }
    hydrationData.params = params;
    const serializedData = escapeJsonForScript(JSON.stringify(hydrationData));
    const dataScript = `<script id="__pyra_data" type="application/json">${serializedData}</script>`;

    // 9. Build hydration script
    const clientEntryUrl = this.manifest.base + entry.clientEntry;
    const hydrationScript = this.adapter.getHydrationScript(
      clientEntryUrl,
      this.containerId,
    );

    // 10. Assemble full HTML
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

    res.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": buildCacheControlHeader(entry.cache),
    });
    res.end(html);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

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

  private get404HTML(pathname: string): string {
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
}

// ─── Standalone helpers ────────────────────────────────────────────────────

/**
 * Build a Cache-Control header value from a route's CacheConfig.
 * Returns "no-cache" if no cache config is provided.
 */
function buildCacheControlHeader(
  cache: import("pyrajs-shared").CacheConfig | undefined,
): string {
  if (!cache) return "no-cache";

  const parts: string[] = ["public"];
  if (cache.maxAge !== undefined) parts.push(`max-age=${cache.maxAge}`);
  if (cache.sMaxAge !== undefined) parts.push(`s-maxage=${cache.sMaxAge}`);
  if (cache.staleWhileRevalidate !== undefined)
    parts.push(`stale-while-revalidate=${cache.staleWhileRevalidate}`);

  return parts.length === 1 ? "no-cache" : parts.join(", ");
}

/**
 * Generate <link> and <script> tags for a route's manifest-declared assets.
 * Each page includes ONLY the assets it needs.
 */
function buildAssetTags(
  entry: ManifestRouteEntry,
  base: string,
): { head: string; body: string } {
  const headParts: string[] = [];

  // CSS in <head>
  for (const css of entry.css || []) {
    headParts.push(`<link rel="stylesheet" href="${base}${css}">`);
  }

  // Preload shared chunks
  for (const chunk of entry.clientChunks || []) {
    headParts.push(`<link rel="modulepreload" href="${base}${chunk}">`);
  }

  // Preload client entry
  if (entry.clientEntry) {
    headParts.push(
      `<link rel="modulepreload" href="${base}${entry.clientEntry}">`,
    );
  }

  return {
    head: headParts.join("\n  "),
    body: "",
  };
}

/**
 * Determine Cache-Control header for a static asset.
 * Hashed files in /assets/ get immutable caching.
 */
function getCacheControl(urlPath: string): string {
  if (urlPath.includes("/assets/") && isHashedFilename(path.basename(urlPath))) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache";
}

/**
 * Check if a filename matches esbuild's [name]-[hash].ext pattern.
 */
function isHashedFilename(filename: string): boolean {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  return /-[A-Za-z0-9]{6,}$/.test(base);
}

/**
 * Get MIME type from file extension.
 */
function getContentType(ext: string): string {
  const types: Record<string, string> = {
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".html": "text/html",
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
    ".map": "application/json",
  };
  return types[ext] || "application/octet-stream";
}
