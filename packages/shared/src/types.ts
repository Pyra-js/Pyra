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

  /** Framework-specific options */
  framework?: {
    /** Framework name: 'react' | 'vue' | 'svelte' | 'preact' | 'solid' */
    name?: string;
    /** Framework-specific options */
    options?: Record<string, any>;
  };
};

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
