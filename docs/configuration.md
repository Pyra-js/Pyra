# Pyra Configuration Reference

A single `pyra.config.ts` showing every available option filled in. Copy it as a starting point and delete what you don't need.

---

```ts
// pyra.config.ts
import { defineConfig } from 'pyrajs-shared';
import { createReactAdapter } from 'pyrajs-adapter-react';
import { pyraImages } from 'pyrajs-core';
import type { PyraPlugin } from 'pyrajs-shared';

// ─── Example custom plugin (all hooks shown) ──────────────────────────────────

const myPlugin: PyraPlugin = {
  name: 'my-plugin',

  // Modify the resolved config before it is used. Return null to leave it unchanged.
  config(config, mode) {
    if (mode === 'production') {
      return { ...config, build: { ...config.build, minify: true } };
    }
    return null;
  },

  // Register esbuild plugins and dev-server middleware. Runs once at pipeline setup.
  setup(api) {
    // api.addEsbuildPlugin(myEsbuildPlugin());
    // api.addMiddleware((req, res, next) => next());
    console.log('mode:', api.getMode());
  },

  // Transform individual modules. Return { code } to replace, or null to skip.
  transform(code, id) {
    if (!id.endsWith('.ts') && !id.endsWith('.tsx')) return null;
    return { code: `// transformed\n${code}` };
  },

  // Called once after the dev server starts listening.
  serverStart(server) {
    console.log('Dev server listening:', server.address());
  },

  // Called once before the production build begins.
  async buildStart() {
    console.log('Build starting…');
  },

  // Called after bundling, before manifest.json is written to disk.
  // The manifest is mutable here — add or modify entries as needed.
  buildEnd({ manifest, outDir, root }) {
    const count = Object.keys(manifest.routes).length;
    console.log(`Built ${count} routes → ${outDir}`);
  },
};

// ─── Main configuration ───────────────────────────────────────────────────────

export default defineConfig({
  // ── Top-level shorthands ────────────────────────────────────────────────────

  // Entry point(s) for the application. Can be a string, array, or named map.
  // Default: 'src/index.ts'
  entry: 'src/index.ts',

  // Project root directory. Default: process.cwd()
  root: process.cwd(),

  // Build output directory. Shorthand for build.outDir. Default: 'dist'
  outDir: 'dist',

  // Dev server port. Shorthand for server.port. Default: 3000
  port: 3000,

  // Build mode. Typically set by CLI ('pyra dev' → 'development', 'pyra build' → 'production').
  mode: 'development',

  // ── Routing ─────────────────────────────────────────────────────────────────

  // Directory containing file-based routes, relative to root. Default: 'src/routes'
  routesDir: 'src/routes',

  // DOM element ID where the app mounts on the client. Default: 'app'
  appContainerId: 'app',

  // Global rendering mode for all routes. Individual routes can override via
  // `export const render = "spa" | "ssr" | "ssg"`. Default: 'ssr'
  renderMode: 'ssr',

  // ── Adapter ─────────────────────────────────────────────────────────────────

  // The UI framework adapter. Pass the adapter instance, a package name string,
  // or false to disable SSR. Default: undefined (no SSR)
  adapter: createReactAdapter(),

  // ── Dev server ──────────────────────────────────────────────────────────────

  server: {
    // Port to listen on. Default: 3000
    port: 3000,

    // Hostname to bind to. Default: 'localhost'
    host: 'localhost',

    // Enable HTTPS. Default: false
    https: false,

    // Open the browser automatically when the server starts. Default: false
    open: true,

    // Enable Hot Module Replacement. Default: true
    hmr: true,

    // CORS configuration.
    // true  → Access-Control-Allow-Origin: * (default in dev)
    // false → no CORS headers (default in prod)
    // object → fine-grained control
    cors: {
      // Allowed origin(s). true = *, string = single, string[] = whitelist.
      origin: ['https://app.example.com', 'https://staging.example.com'],

      // HTTP methods the browser is allowed to use. Default: all standard methods.
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

      // Request headers the browser is allowed to send.
      // Default: ['Content-Type', 'Authorization']
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],

      // Response headers the browser is allowed to read.
      exposedHeaders: ['X-Request-ID', 'Server-Timing'],

      // Allow cookies and Authorization headers across origins.
      // Requires a specific origin — cannot be combined with origin: true.
      credentials: true,

      // Preflight cache duration in seconds. Default: 86400 (24 h)
      maxAge: 3600,
    },

    // Proxy requests matching a path prefix to another server.
    proxy: {
      '/api/legacy': 'http://localhost:4000',
      '/api/payments': {
        target: 'https://payments.internal',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/payments/, ''),
      },
    },
  },

  // ── Production build ────────────────────────────────────────────────────────

  build: {
    // Output directory for built assets. Default: 'dist'
    outDir: 'dist',

    // Generate source maps.
    // true | false | 'inline' | 'external'. Default: false in production.
    sourcemap: false,

    // Minify output bundles. Default: true in production.
    minify: true,

    // esbuild compile target. Default: 'es2020'
    target: 'es2020',

    // Packages to exclude from bundling (treated as external imports).
    external: ['sharp'],

    // Additional file patterns to treat as static assets.
    assetsInclude: ['**/*.wasm', /\.bin$/],

    // Directory of static files to copy to the output as-is. Default: 'public'
    publicDir: 'public',

    // Base public path prepended to all asset URLs. Default: '/'
    base: '/',

    // Enable code splitting (shared chunks). Default: true
    splitting: true,

    // Warn when a client chunk exceeds this size in KB. Default: 500
    chunkSizeWarningLimit: 250,
  },

  // ── Module resolution ────────────────────────────────────────────────────────

  resolve: {
    // Path aliases. Replaces the key with the value during import resolution.
    alias: {
      '@': './src',
      '@components': './src/components',
      '@lib': './src/lib',
    },

    // File extensions to try when resolving bare imports.
    // Default: ['.ts', '.tsx', '.js', '.jsx', '.json']
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],

    // package.json fields checked for the module entry point.
    // Default: ['module', 'main']
    mainFields: ['module', 'main'],

    // Conditions for the package.json exports field.
    conditions: ['import', 'module', 'browser', 'default'],
  },

  // ── Environment variables ────────────────────────────────────────────────────

  env: {
    // Directory where .env files are read from. Default: root
    dir: '.',

    // Only env vars with this prefix are exposed to the client.
    // The prefix is stripped from the key before exposure.
    // Default: 'PYRA_'
    prefix: 'PYRA_',

    // Additional .env files to load, in order.
    // Standard .env and .env.local are always loaded automatically.
    files: ['.env.shared', '.env.secrets'],
  },

  // ── Build-time constant replacement ─────────────────────────────────────────

  // Statically replace these expressions in source code at bundle time.
  define: {
    __APP_VERSION__: JSON.stringify('1.0.0'),
    __COMMIT_SHA__: JSON.stringify(process.env.GIT_SHA ?? 'local'),
    __FEATURE_FLAGS__: JSON.stringify({ newDashboard: true }),
  },

  // ── Feature flags ───────────────────────────────────────────────────────────

  features: {
    // Enable CSS Modules (*.module.css). Default: true
    cssModules: true,

    // Run TypeScript type checking during dev/build. Default: true
    typeCheck: true,

    // Enable JSX/TSX transform. Default: true
    jsx: true,
  },

  // ── Tracing ─────────────────────────────────────────────────────────────────
  // In dev mode, tracing is always on regardless of this setting.

  trace: {
    // Request tracing in production.
    // 'off'    → disabled (default in prod)
    // 'header' → trace requests that include X-Pyra-Trace header
    // 'on'     → trace every request
    production: 'header',

    // Number of traces kept in the in-memory ring buffer. Default: 200
    bufferSize: 500,
  },

  // ── Build report ────────────────────────────────────────────────────────────

  buildReport: {
    // Warn in the build report when a client JS chunk exceeds this size in bytes.
    // Default: 51200 (50 KB)
    warnSize: 75_000,
  },

  // ── Advanced esbuild passthrough ────────────────────────────────────────────

  // Raw esbuild options merged into every esbuild call. Use sparingly —
  // most needs are better served by the structured fields above.
  esbuild: {
    legalComments: 'none',
    treeShaking: true,
  },

  // ── Plugins ─────────────────────────────────────────────────────────────────

  plugins: [
    // Built-in image optimization plugin.
    // Generates responsive variants at build time; serves on-demand in dev.
    pyraImages({
      // Output formats to generate. Default: ['webp']
      formats: ['webp', 'avif'],

      // Responsive widths in pixels. Never upscales. Default: [640, 1280, 1920]
      sizes: [640, 1280, 1920],

      // Compression quality 1–100. Default: 80
      quality: 85,

      // Dev-mode on-disk image cache. Default: '.pyra/image-cache'
      cacheDir: '.pyra/image-cache',

      // Allowed external hostnames (future remote proxy support).
      domains: ['images.example.com'],
    }),

    // Your own plugin with all lifecycle hooks wired up (defined above).
    myPlugin,
  ],
});
```

---

## Mode-aware configuration

Use `defineConfigFn` when you need different values in development vs. production:

```ts
// pyra.config.ts
import { defineConfigFn } from 'pyrajs-shared';
import { createReactAdapter } from 'pyrajs-adapter-react';

export default defineConfigFn((mode) => ({
  adapter: createReactAdapter(),
  routesDir: 'src/routes',

  server: {
    open: mode === 'development',
    cors:
      mode === 'development'
        ? true
        : { origin: 'https://app.example.com', credentials: true },
  },

  build: {
    sourcemap: mode === 'development',
    minify: mode === 'production',
  },

  trace: {
    production: mode === 'production' ? 'header' : 'on',
  },
}));
```

---

## Config file discovery order

Pyra searches for config files in this order and uses the first one found:

| Priority | Filename |
|----------|----------|
| 1 | `pyra.config.ts` |
| 2 | `pyra.config.js` |
| 3 | `pyra.config.mjs` |
| 4 | `pyra.config.cjs` |
| 5 | `.pyrarc.ts` |
| 6 | `.pyrarc.js` |
| 7 | `.pyrarc.mjs` |

Pass `--config path/to/file` to any CLI command to skip discovery and load a specific file.

---

## Priority order

Later sources win when the same key is set in multiple places:

```
defaults  <  config file  <  CLI flags
```
