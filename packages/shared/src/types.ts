/**
 * Pyra build mode
 */
export type PyraMode = 'development' | 'production';

/**
 * Rendering mode for routes.
 * - 'ssr': Server-side rendered on each request (default).
 * - 'spa': Client-side only — serves an HTML shell, no server rendering.
 * - 'ssg': Static site generation — prerendered to HTML at build time.
 */
export type RenderMode = 'ssr' | 'spa' | 'ssg';

/**
 * CORS configuration for the dev and production servers.
 */
export type CorsConfig = {
  /**
   * Allowed origin(s).
   * - `true` (default) — reflect `*` (allow all origins)
   * - `false` — disable CORS entirely
   * - `string` — a single allowed origin, e.g. `'https://app.example.com'`
   * - `string[]` — whitelist of allowed origins; the request Origin is echoed
   *   back when it matches, otherwise the header is omitted.
   */
  origin?: boolean | string | string[];
  /** Allowed HTTP methods (default: GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS) */
  methods?: string[];
  /** Allowed request headers (default: Content-Type, Authorization) */
  allowedHeaders?: string[];
  /** Headers to expose to the browser via Access-Control-Expose-Headers */
  exposedHeaders?: string[];
  /**
   * Allow credentials (cookies, Authorization headers, TLS certificates).
   * Note: credentials cannot be combined with `origin: true` (`*`) — set a
   * specific origin when enabling this.
   */
  credentials?: boolean;
  /** Preflight response cache duration in seconds (default: 86400 — 24 h) */
  maxAge?: number;
};

/**
 * Dev server configuration
 */
export type DevServerConfig = {
  /** Dev server port (default: 3000) */
  port?: number;
  /** Host to bind to (default: 'localhost') */
  host?: string;
  /** Enable HTTPS (default: false) */
  https?: boolean;
  /** Open browser on server start (default: false) */
  open?: boolean;
  /** Enable HMR (Hot Module Replacement) (default: true) */
  hmr?: boolean;
  /**
   * CORS configuration.
   * - `true` (default in dev) — allow all origins with `Access-Control-Allow-Origin: *`
   * - `false` — disable CORS headers entirely
   * - `CorsConfig` — fine-grained control over origins, methods, headers, etc.
   */
  cors?: boolean | CorsConfig;
  /** Proxy configuration for API requests */
  proxy?: Record<string, string | { target: string; changeOrigin?: boolean; rewrite?: (path: string) => string }>;
  /** Custom middleware */
  middleware?: any[];
};

/**
 * Build configuration
 */
export type BuildConfig = {
  /** Output directory (default: 'dist') */
  outDir?: string;
  /** Generate sourcemaps (default: true in dev, false in prod) */
  sourcemap?: boolean | 'inline' | 'external';
  /** Minify output (default: true in production) */
  minify?: boolean;
  /** Target environment (default: 'es2020') */
  target?: string | string[];
  /** External dependencies (won't be bundled) */
  external?: string[];
  /** Asset include pattern */
  assetsInclude?: string | RegExp | (string | RegExp)[];
  /** Public directory for static assets (default: 'public') */
  publicDir?: string;
  /** Base public path (default: '/') */
  base?: string;
  /** Enable code splitting (default: true) */
  splitting?: boolean;
  /** Chunk size warnings threshold in KB (default: 500) */
  chunkSizeWarningLimit?: number;
};

/**
 * Module resolution configuration
 */
export type ResolveConfig = {
  /** Path aliases */
  alias?: Record<string, string>;
  /** Extensions to resolve (default: ['.ts', '.tsx', '.js', '.jsx', '.json']) */
  extensions?: string[];
  /** Main fields to check in package.json (default: ['module', 'main']) */
  mainFields?: string[];
  /** Conditions for package.json exports field */
  conditions?: string[];
};

/**
 * Environment variables configuration
 */
export type EnvConfig = {
  /** Directory containing .env files (default: root) */
  dir?: string;
  /** Prefix for env variables to expose to client (default: 'PYRA_') */
  prefix?: string | string[];
  /** Additional env files to load */
  files?: string[];
};

/**
 * Pyra plugin API
 */
export type PyraPlugin = {
  /** Unique plugin name */
  name: string;
  /** Called once when build pipeline is constructed */
  setup?: (api: {
    /** Add an esbuild plugin */
    addEsbuildPlugin: (p: any) => void;
    /** Add a Rollup plugin */
    addRollupPlugin?: (p: any) => void;
    /** Register custom middleware for dev server */
    addMiddleware?: (middleware: any) => void;
    /** Get current config */
    getConfig: () => PyraConfig;
    /** Get current mode */
    getMode: () => PyraMode;
  }) => void | Promise<void>;
  /** Transform hook for individual modules */
  transform?: (code: string, id: string) => { code: string; map?: any } | null | Promise<{ code: string; map?: any } | null>;
  /** Modify config before it's resolved */
  config?: (config: PyraConfig, mode: PyraMode) => PyraConfig | null | Promise<PyraConfig | null>;
  /** Called when server starts */
  serverStart?: (server: any) => void | Promise<void>;
  /** Called before build starts */
  buildStart?: () => void | Promise<void>;
  /** Called after build completes. Receives the assembled manifest (mutable) before it is written to disk. */
  buildEnd?: (ctx: { manifest: RouteManifest; outDir: string; root: string }) => void | Promise<void>;
};

/**
 * Main Pyra configuration
 */
export type PyraConfig = {
  /** Entry point(s) for the application (default: 'src/index.ts') */
  entry?: string | string[] | Record<string, string>;

  /** Output directory (default: 'dist') - shorthand for build.outDir */
  outDir?: string;

  /** Dev server port (default: 3000) - shorthand for server.port */
  port?: number;

  /** Build mode (default: 'development' for dev, 'production' for build) */
  mode?: PyraMode;

  /** Root directory (default: process.cwd()) */
  root?: string;

  /** Dev server configuration */
  server?: DevServerConfig;

  /** Build configuration */
  build?: BuildConfig;

  /** Module resolution configuration */
  resolve?: ResolveConfig;

  /** Environment variables configuration */
  env?: EnvConfig;

  /** Pyra plugins */
  plugins?: PyraPlugin[];

  /** Define global constants for build-time replacement */
  define?: Record<string, any>;

  /** The UI framework adapter. */
  adapter?: string | PyraAdapter | false;

  /** Directory containing route files, relative to root. Default: 'src/routes' */
  routesDir?: string;

  /** DOM element ID where the app mounts on the client. Default: 'app' */
  appContainerId?: string;

  /**
   * Global rendering mode for all routes (default: 'ssr').
   * Individual routes can override via `export const render = "spa" | "ssr" | "ssg"`.
   */
  renderMode?: RenderMode;

  /** Transparency / tracing configuration (v0.9). */
  trace?: {
    /**
     * Enable request tracing in production.
     * 'off' = no tracing (default in prod).
     * 'header' = trace when X-Pyra-Trace header is present.
     * 'on' = trace every request.
     * In dev mode, tracing is always on regardless of this setting.
     */
    production?: 'off' | 'header' | 'on';
    /** Number of traces to keep in the ring buffer (default: 200). */
    bufferSize?: number;
  };

  /** Build configuration extras. */
  buildReport?: {
    /** Client JS size warning threshold in bytes (default: 51200 = 50 KB). */
    warnSize?: number;
  };
};

/**
 * Structured result returned by DevServer.start().
 * Contains all data the CLI needs to render the startup banner.
 */
export interface DevServerResult {
  /** The port the server is actually listening on. */
  port: number;
  /** The host the server is bound to. */
  host: string;
  /** The protocol (http or https). */
  protocol: 'http' | 'https';
  /** Whether SSR is active (adapter + routes found). */
  ssr: boolean;
  /** Adapter name if SSR is enabled (e.g., 'react'). */
  adapterName?: string;
  /** Number of page routes discovered. */
  pageRouteCount: number;
  /** Number of API routes discovered. */
  apiRouteCount: number;
  /** Warnings collected during startup. */
  warnings: string[];
  /** Elapsed startup time in milliseconds. */
  startupMs: number;
}

export interface ProdServerResult {
  /** The port the server is actually listening on. */
  port: number;
  /** The host the server is bound to. */
  host: string;
  /** The protocol (http or https). */
  protocol: "http" | "https";
  /** Adapter name (e.g., 'react'). */
  adapterName: string;
  /** Number of page routes in the manifest. */
  pageRouteCount: number;
  /** Number of API routes in the manifest. */
  apiRouteCount: number;
  /** Number of SSG (prerendered) routes in the manifest. */
  ssgRouteCount: number;
  /** Warnings collected during startup. */
  warnings: string[];
  /** Elapsed startup time in milliseconds. */
  startupMs: number;
}

// Route Types (v0.1)
/**
 * A single route discovered by the filesystem scanner.
 * Represents either a page route (page.tsx) or an API route (route.ts).
 */
export interface RouteNode {
  /** Unique ID derived from file path: '/blog/[slug]'. */
  readonly id: string;

  /** URL pattern for matching: '/blog/:slug'. */
  readonly pattern: string;

  /** Absolute path to the route file on disk. */
  readonly filePath: string;

  /** 'page' for page.* files, 'api' for route.ts files. */
  readonly type: 'page' | 'api';

  /** Dynamic parameter names: ['slug']. Empty array for static routes. */
  readonly params: string[];

  /** Whether this is a catch-all route ([...rest]). Always false in v0.1. */
  readonly catchAll: boolean;

  /** Route ID of the nearest ancestor layout, if any. */
  readonly layoutId?: string;

  /** Absolute paths to middleware files that apply to this route (outermost first). */
  readonly middlewarePaths: string[];

  /** Child route IDs (for visualization / enumeration). */
  readonly children: string[];

  /** Route ID of the nearest ancestor error boundary (error.tsx), if any. */
  readonly errorBoundaryId?: string;
}

/**
 * The result of matching a URL pathname against the route graph.
 */
export interface RouteMatch {
  /** The matched route node. */
  readonly route: RouteNode;

  /** Extracted URL parameters: { slug: 'hello-world' }. */
  readonly params: Record<string, string>;

  /**
   * Layout chain from outermost to innermost.
   * Core passes this to the adapter so it can nest layouts around the page.
   */
  readonly layouts: RouteNode[];
}

/**
 * The in-memory representation of all discovered routes.
 * Built by scanning the filesystem at dev/build startup.
 * Used by the request pipeline to match URLs at runtime.
 */
export interface RouteGraph {
  /** Flat map of all route nodes keyed by route ID. */
  readonly nodes: ReadonlyMap<string, RouteNode>;

  /** Match a URL pathname to a route. Returns null if no match. */
  match(pathname: string): RouteMatch | null;

  /** Get a route by its ID. */
  get(id: string): RouteNode | undefined;

  /** All page routes (for build-time enumeration). */
  pageRoutes(): RouteNode[];

  /** All API routes. */
  apiRoutes(): RouteNode[];

  /** Serializable snapshot for debugging / manifest generation. */
  toJSON(): SerializedRouteGraph;
}

/**
 * JSON-serializable snapshot of the route graph.
 */
export interface SerializedRouteGraph {
  routes: Record<string, {
    id: string;
    pattern: string;
    filePath: string;
    type: 'page' | 'api';
    params: string[];
    catchAll: boolean;
    layoutId?: string;
    middlewarePaths: string[];
    children: string[];
  }>;
}

// Adapter Types

/**
 * Passed to renderToHTML so adapters can set <head> tags and
 * read route information during the render pass.
 */
export interface RenderContext {
  /** The request URL. */
  url: URL;
  /** Route parameters extracted by the router. */
  params: Record<string, string>;
  /** Adapters call this to append tags into <head>. */
  pushHead(tag: string): void;
  /** Layout components to wrap the page, outermost first (v0.8+). */
  layouts?: unknown[];
  /** Error page props when rendering an error boundary (v1.0+). */
  error?: ErrorPageProps;
}

/**
 * The contract every UI framework adapter must implement.
 * Core calls these methods at build time and request time.
 * Adapters MUST NOT import or depend on pyrajs-core.
 */
export interface PyraAdapter {
  /** Human-readable name: 'react', 'svelte', 'vue', etc. */
  readonly name: string;

  /** File extensions this adapter handles: ['.tsx', '.jsx'] for React. */
  readonly fileExtensions: readonly string[];

  /**
   * Return esbuild plugins needed to compile this framework's file types.
   * Called once during build setup and once during dev server init.
   */
  esbuildPlugins(): import('esbuild').Plugin[];

  /**
   * Server-side render a page component to an HTML fragment (the page body).
   * Core wraps the fragment in the document shell and injects asset tags.
   *
   * @param component - The route module's default export (opaque to core).
   * @param data      - The return value of the route's load() function, or null.
   * @param context   - Render context with URL, params, and head-management helpers.
   * @returns HTML string of the rendered page body.
   */
  renderToHTML(
    component: unknown,
    data: unknown,
    context: RenderContext,
  ): Promise<string> | string;

  /**
   * Return the inline JavaScript needed to hydrate the page on the client.
   * Core injects this into a <script type="module"> tag in the document.
   *
   * @param clientEntryPath - The URL path to the client-side route module.
   * @param containerId     - The DOM element ID where the app is mounted.
   */
  getHydrationScript(clientEntryPath: string, containerId: string, layoutClientPaths?: string[]): string;

  /**
   * Return the HTML document shell that wraps rendered page content.
   * Must include <!--pyra-outlet--> where the page body is injected,
   * and <!--pyra-head--> where head tags go.
   * If not provided, core uses a sensible default.
   */
  getDocumentShell?(): string;
}

// ─── End Adapter Types ────────────────────────────────────────────────────────

// ─── Request Context Types (v0.3) ────────────────────────────────────────────

/**
 * Passed to load() functions, API handlers, and middleware.
 * Built from Web standard Request and enriched with Pyra's routing data.
 */
export interface RequestContext {
  /** The original Web standard Request object. */
  request: Request;

  /** Parsed URL (avoids re-parsing in every handler). */
  url: URL;

  /** Route parameters extracted by the router: { slug: 'hello-world' }. */
  params: Record<string, string>;

  /** Request headers (alias for request.headers). */
  headers: Headers;

  /** Parsed cookies from the Cookie header. */
  cookies: CookieJar;

  /** Environment variables (filtered by the env config prefix). */
  env: Record<string, string>;

  /** Current mode: 'development' or 'production'. */
  mode: PyraMode;

  /** The matched route's ID (e.g., '/blog/[slug]'). */
  routeId: string;

  /** Create a JSON response. */
  json(data: unknown, init?: ResponseInit): Response;

  /** Create an HTML response. */
  html(body: string, init?: ResponseInit): Response;

  /** Create a redirect response. */
  redirect(url: string, status?: number): Response;

  /** Create a plain text response. */
  text(body: string, init?: ResponseInit): Response;
}

/**
 * Cookie jar for reading and writing cookies.
 * Parsed from the Cookie header on construction.
 * Mutations are tracked as pending Set-Cookie headers.
 */
export interface CookieJar {
  get(name: string): string | undefined;
  getAll(): Record<string, string>;
  set(name: string, value: string, options?: CookieOptions): void;
  delete(name: string): void;
}

export interface CookieOptions {
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none";
}

// ─── Middleware & Layout Types (v0.8) ────────────────────────────────────────

/**
 * A middleware function that can intercept requests.
 * Call next() to continue to the next middleware or the route handler.
 * Return a Response without calling next() to short-circuit.
 */
export type Middleware = (
  context: RequestContext,
  next: () => Promise<Response>,
) => Promise<Response> | Response;

/**
 * The export shape core expects from a middleware.ts file.
 * The default export is the middleware function.
 */
export interface MiddlewareModule {
  default: Middleware;
}

/**
 * The export shape core expects from a layout.tsx file.
 * The default export is the layout component (opaque to core — passed to adapter).
 */
export interface LayoutModule {
  default: unknown;
}

/**
 * The export shape core expects from an error.tsx file (v1.0+).
 * The default export is the error page component.
 * It receives ErrorPageProps as its props.
 */
export interface ErrorModule {
  default: unknown;
}

/**
 * Props passed to error page components by the framework.
 * Core constructs this and hands it to adapter.renderToHTML() as the data argument.
 */
export interface ErrorPageProps {
  /** Error message. In dev: full message. In prod: generic message. */
  message: string;
  /** Error stack trace. Only present in development mode. */
  stack?: string;
  /** HTTP status code (e.g., 500, 404). */
  statusCode: number;
  /** The request pathname that caused the error. */
  pathname: string;
}

/**
 * The export shape core expects from a page route file (e.g., page.tsx).
 * The default export is opaque to core — it's passed to the adapter.
 */
export interface PageRouteModule {
  /** The page component. Core never inspects this; it's the adapter's input. */
  default: unknown;

  /** Server-side data loader. Runs on every request (SSR) or at build time (SSG). */
  load?: (context: RequestContext) => Promise<unknown> | unknown;

  /**
   * Per-route rendering mode override.
   * Takes precedence over the global `renderMode` in pyra.config.
   */
  render?: RenderMode;

  /** Prerender configuration for SSG (v0.7+). Also used when render = "ssg". */
  prerender?: boolean | PrerenderConfig;

  /** HTTP cache-control hints for this route (v0.7+). */
  cache?: CacheConfig;

  /** Static metadata (page title, description). */
  metadata?: RouteMetadata;
}

export interface PrerenderConfig {
  paths(): Promise<Record<string, string>[]> | Record<string, string>[];
}

export interface CacheConfig {
  maxAge?: number;
  sMaxAge?: number;
  staleWhileRevalidate?: number;
}

export interface RouteMetadata {
  title?: string;
  description?: string;
  [key: string]: unknown;
}

// ─── Image Optimization Types (v1.1) ─────────────────────────────────────────

/** Supported output formats for image optimization. */
export type ImageFormat = "webp" | "avif" | "jpeg" | "png";

/** Configuration for the pyraImages() plugin. */
export type ImageConfig = {
  /** Output formats to generate (default: ['webp']). */
  formats?: ImageFormat[];
  /** Responsive widths in pixels (default: [640, 1280, 1920]). Never upscales. */
  sizes?: number[];
  /** Compression quality 1–100 (default: 80). */
  quality?: number;
  /** On-disk cache directory for dev-mode optimization (default: '.pyra/image-cache'). */
  cacheDir?: string;
  /** Allowed external hostnames for future remote image proxy support. */
  domains?: string[];
};

/** A single optimized variant of a source image. */
export type ImageVariant = {
  /** Relative path inside dist/client/ (e.g. '_images/hero-abc123-640w.webp'). */
  path: string;
  /** Width of this variant in pixels. */
  width: number;
  /** Output format. */
  format: ImageFormat;
  /** File size in bytes. */
  size: number;
};

/** Manifest entry for a single source image and all its generated variants. */
export type ImageManifestEntry = {
  /** Original URL path relative to project root (e.g. '/images/hero.jpg'). */
  src: string;
  /** Original image width in pixels. */
  originalWidth: number;
  /** Original image height in pixels. */
  originalHeight: number;
  /** Original file format (e.g. 'jpeg'). */
  originalFormat: string;
  /**
   * Variant map keyed by `"${width}:${format}"` (e.g. `"640:webp"`).
   * The /_pyra/image endpoint uses this map to locate pre-built files in prod.
   */
  variants: Record<string, ImageVariant>;
};

// ─── End Image Optimization Types ────────────────────────────────────────────

// ─── End Request Context Types ───────────────────────────────────────────────

// Route Manifest Types (v0.4) 

/**
 * Written to dist/manifest.json by the build orchestrator.
 * Read by the prod runtime at startup to map routes to built assets.
 * Designed to be human-readable.
 */
export interface RouteManifest {
  /** Schema version for forward compatibility. */
  version: 1;

  /** The adapter that was used for the build. */
  adapter: string;

  /** Base public path (default '/'). */
  base: string;

  /** Build timestamp (ISO 8601). */
  builtAt: string;

  /** Global rendering mode used during the build. */
  renderMode: RenderMode;

  /** Map of route ID → route entry. */
  routes: Record<string, ManifestRouteEntry>;

  /** Map of asset filename → asset metadata. */
  assets: Record<string, ManifestAsset>;

  /** Path to the SPA fallback HTML (relative to dist/client/), if any SPA routes exist. */
  spaFallback?: string;

  /** Optimized image manifest produced by the pyraImages() plugin, if active. */
  images?: Record<string, ImageManifestEntry>;
}

export interface ManifestRouteEntry {
  /** Route ID: '/blog/[slug]'. */
  id: string;

  /** URL pattern for matching: '/blog/:slug'. */
  pattern: string;

  /** 'page' or 'api'. */
  type: 'page' | 'api';

  /** Resolved rendering mode for this route. */
  renderMode?: RenderMode;

  // --- Page route fields (present when type === 'page') ---

  /** Path to the client entry chunk (relative to dist/client/). */
  clientEntry?: string;

  /** Additional client chunks this route needs (shared splits). */
  clientChunks?: string[];

  /** CSS files for this route. */
  css?: string[];

  /** Path to the SSR module (relative to dist/server/). */
  ssrEntry?: string;

  /** Whether this route was prerendered to static HTML. */
  prerendered?: boolean;

  /** Path to prerendered HTML if prerendered is true. */
  prerenderedFile?: string;

  /** Whether the route module exports a load() function. */
  hasLoad?: boolean;

  /** Number of prerendered paths for dynamic SSG routes (e.g., 3 for 3 slugs). */
  prerenderedCount?: number;

  /** Cache-Control configuration from the route's cache export. */
  cache?: CacheConfig;

  // --- API route fields (present when type === 'api') ---

  /** Path to the server handler module (relative to dist/server/). */
  serverEntry?: string;

  /** HTTP methods this route handles. */
  methods?: string[];

  // --- Metadata ---

  /** Layout chain IDs (outermost first). */
  layouts?: string[];

  /** Paths to server-side layout modules (relative to dist/server/, outermost first). */
  layoutEntries?: string[];

  /** Paths to client-side layout modules (relative to dist/client/, outermost first). */
  layoutClientEntries?: string[];

  /** Paths to server-side middleware modules (relative to dist/server/, outermost first). */
  middleware?: string[];

  /** Path to the server-side error boundary module (relative to dist/server/). */
  errorBoundaryEntry?: string;

  /** Path to the client-side error boundary module (relative to dist/client/). */
  errorBoundaryClientEntry?: string;
}

export interface ManifestAsset {
  /** Output filename (content-hashed). */
  file: string;

  /** Content hash for cache busting. */
  hash: string;

  /** Size in bytes. */
  size: number;

  /** MIME type. */
  type: string;
}

/**
 * The export shape core expects from an API route file (e.g., route.ts).
 * Each exported function name corresponds to an HTTP method.
 */
export interface APIRouteModule {
  GET?: (context: RequestContext) => Response | Promise<Response>;
  POST?: (context: RequestContext) => Response | Promise<Response>;
  PUT?: (context: RequestContext) => Response | Promise<Response>;
  DELETE?: (context: RequestContext) => Response | Promise<Response>;
  PATCH?: (context: RequestContext) => Response | Promise<Response>;
  HEAD?: (context: RequestContext) => Response | Promise<Response>;
  OPTIONS?: (context: RequestContext) => Response | Promise<Response>;
}

/** HTTP methods recognized in API route modules. */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;

// ─── End Route Manifest Types ────────────────────────────────────────────────

// ─── Request Trace Types (v0.9) ─────────────────────────────────────────────

/**
 * Collected during request processing. Every request produces a trace.
 * In dev mode, traces are always emitted. In production, traces are
 * opt-in via config or request header.
 */
export interface RequestTrace {
  /** Unique request ID. */
  id: string;
  /** HTTP method. */
  method: string;
  /** Request URL pathname. */
  pathname: string;
  /** Matched route ID, or null if 404. */
  routeId: string | null;
  /** Route type: 'page', 'api', or 'static'. */
  routeType: 'page' | 'api' | 'static' | null;
  /** Ordered list of timed pipeline stages. */
  stages: TraceStage[];
  /** Total request duration in milliseconds. */
  totalMs: number;
  /** HTTP status code of the response. */
  status: number;
  /** Timestamp when the request started. */
  timestamp: number;
  /** Error message if a stage threw. */
  error?: string;
}

export interface TraceStage {
  /** Stage name: 'route-match', 'middleware:auth', 'load', 'render', 'inject-assets'. */
  name: string;
  /** Duration of this stage in milliseconds. */
  durationMs: number;
  /** Optional detail (e.g., middleware file path, load() data source). */
  detail?: string;
  /** Error message if this stage threw. */
  error?: string;
}

/**
 * Filter for querying stored traces.
 */
export interface TraceFilter {
  routeId?: string;
  status?: number;
  minMs?: number;
  since?: number;
}

/**
 * Aggregate timing statistics for a single route.
 */
export interface RouteStats {
  routeId: string;
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  lastMs: number;
}

// ─── End Request Trace Types ────────────────────────────────────────────────

/**
 * Helper to define config with type safety
 */
export function defineConfig(config: PyraConfig): PyraConfig {
  return config;
}

/**
 * Helper to define config as a function with mode support
 */
export function defineConfigFn(
  fn: (mode: PyraMode) => PyraConfig
): (mode: PyraMode) => PyraConfig {
  return fn;
}
