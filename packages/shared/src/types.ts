/**
 * Pyra build mode
 */
export type PyraMode = 'development' | 'production';

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
  /** CORS configuration (default: true) */
  cors?: boolean;
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
  /** Called after build completes */
  buildEnd?: () => void | Promise<void>;
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

  /** Enable/disable specific features */
  features?: {
    /** Enable CSS modules (default: true) */
    cssModules?: boolean;
    /** Enable TypeScript type checking (default: true) */
    typeCheck?: boolean;
    /** Enable JSX/TSX support (default: true) */
    jsx?: boolean;
  };

  /** Custom esbuild options (advanced) */
  esbuild?: Record<string, any>;

  /** Framework-specific options (deprecated — use adapter instead) */
  framework?: {
    /** Framework name: 'react' | 'vue' | 'svelte' | 'preact' | 'solid' */
    name?: string;
    /** Framework-specific options */
    options?: Record<string, any>;
  };

  /** The UI framework adapter. */
  adapter?: string | PyraAdapter | false;

  /** Directory containing route files, relative to root. Default: 'src/routes' */
  routesDir?: string;

  /** DOM element ID where the app mounts on the client. Default: 'app' */
  appContainerId?: string;
};

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
  getHydrationScript(clientEntryPath: string, containerId: string): string;

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

/**
 * The export shape core expects from a page route file (e.g., page.tsx).
 * The default export is opaque to core — it's passed to the adapter.
 */
export interface PageRouteModule {
  /** The page component. Core never inspects this; it's the adapter's input. */
  default: unknown;

  /** Server-side data loader. Runs on every request (SSR) or at build time (SSG). */
  load?: (context: RequestContext) => Promise<unknown> | unknown;

  /** Prerender configuration for SSG (v0.7+). */
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

  /** Map of route ID → route entry. */
  routes: Record<string, ManifestRouteEntry>;

  /** Map of asset filename → asset metadata. */
  assets: Record<string, ManifestAsset>;
}

export interface ManifestRouteEntry {
  /** Route ID: '/blog/[slug]'. */
  id: string;

  /** URL pattern for matching: '/blog/:slug'. */
  pattern: string;

  /** 'page' or 'api'. */
  type: 'page' | 'api';

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

  // --- API route fields (present when type === 'api') ---

  /** Path to the server handler module (relative to dist/server/). */
  serverEntry?: string;

  /** HTTP methods this route handles. */
  methods?: string[];

  // --- Metadata ---

  /** Layout chain IDs (outermost first). */
  layouts?: string[];

  /** Middleware file paths. */
  middleware?: string[];
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
