# pyrajs-core

The engine that powers Pyra.js. Handles everything from file-based route scanning to the production build pipeline: dev server with HMR, production server, esbuild bundling, trie-based routing, middleware execution, request context, request tracing, metrics, and image optimization.

```bash
npm install pyrajs-core
# or
pnpm add pyrajs-core
```

> **Node.js >=18.0.0 required.** The package uses native `Request`, `Response`, and `Headers` globals introduced in Node 18.

---

## What's included

### Dev Server

HTTP + WebSocket server for local development. Compiles pages on request, injects HMR, and serves the Pyra dashboard UI.

```ts
import { DevServer } from 'pyrajs-core';

const server = new DevServer({
  config,
  adapter,
  routesDir: 'src/routes',
  port: 3000,
});

await server.start();
// server.stop() for graceful shutdown
```

The dev server handles everything in one process:
- Static file serving from `public/`
- On-demand SSR compilation via esbuild
- WebSocket HMR notifications on file changes
- API route handling
- Middleware execution
- Request tracing at `/_pyra/api/traces`
- On-demand image optimization at `/_pyra/image` (when `pyraImages()` plugin is active)

### Production Server

Reads the build manifest and serves pre-built assets from `dist/`. Has the same SSR pipeline as the dev server but imports pre-built modules instead of compiling on the fly.

```ts
import { ProdServer } from 'pyrajs-core';

const server = new ProdServer({
  config,
  adapter,
  distDir: 'dist',
  port: 3000,
});

await server.start();
```

Supports graceful shutdown with in-flight request draining (10-second timeout), 503 responses during the drain window, and `Server-Timing` headers when tracing is enabled.

### Route Scanner

Recursively walks `src/routes/` and discovers all route files.

```ts
import { scanRoutes } from 'pyrajs-core';

const result = await scanRoutes('src/routes', ['.tsx', '.jsx']);
```

`ScanResult` contains:
- `pages` — `page.tsx` files mapped to route IDs and URL patterns
- `apiRoutes` — `route.ts` files
- `layouts` — `layout.tsx` files with resolved ancestry
- `middleware` — `middleware.ts` files with resolved ancestry
- `errors` — `error.tsx` files with resolved ancestry
- `notFoundPage` — `404.tsx` if present

Supports dynamic segments (`[slug]`), catch-all segments (`[...rest]`), route groups (`(marketing)`), and collision detection.

### Router

Builds a trie from a `ScanResult` and exposes a `match(pathname)` method.

```ts
import { scanRoutes, createRouter } from 'pyrajs-core';

const scan = await scanRoutes('src/routes', ['.tsx']);
const router = createRouter(scan);

const match = router.match('/blog/hello-world');
// { route, params: { slug: 'hello-world' }, layouts: [...] }
```

Priority order: static segments > dynamic segments > catch-all segments. The router is used by both the dev server and the production server.

### Bundler

Wraps esbuild with an in-memory cache (5-second TTL) and dependency tracking for smart cache invalidation.

```ts
import { bundleFile, clearBundleCache, invalidateDependentCache } from 'pyrajs-core';

const result = await bundleFile('src/routes/blog/[slug]/page.tsx', {
  platform: 'node',
  format: 'esm',
});
```

The cache is intentionally short-lived for the dev server and cleared on file changes via `invalidateDependentCache()`.

### Build Orchestrator

Runs a full production build: client JS bundles with code splitting + content hashing, server SSR bundles, prerendered HTML for SSG pages, and a `dist/manifest.json`.

```ts
import { build } from 'pyrajs-core';

await build({
  config,
  adapter,
  routesDir: 'src/routes',
  outDir: 'dist',
  minify: true,
});
```

The build report table shows per-route sizes, render modes (SSR / SSG / SPA), and gzip estimates. Size warnings are emitted for chunks above the configured threshold.

### Request Context

Constructs the `RequestContext` object passed to `load()` functions and middleware from a Node.js `IncomingMessage`.

```ts
import { createRequestContext } from 'pyrajs-core';

const ctx = createRequestContext({
  req,
  url,
  params,
  config,
  mode: 'development',
  routeId: '/blog/[slug]',
});
```

`ctx` includes:
- `ctx.request` — Web standard `Request`
- `ctx.url` — parsed `URL`
- `ctx.params` — route parameters
- `ctx.cookies` — `CookieJar` with `get`, `set`, `delete`, `getAll`
- `ctx.env` — environment variables filtered by `PYRA_` prefix (prefix stripped from keys)
- `ctx.json()`, `ctx.html()`, `ctx.redirect()`, `ctx.text()` — response helpers

For prerendering at build time, use `createBuildTimeRequestContext()` to create a synthetic context without a real request.

### Middleware Runner

Executes a chain of middleware functions with a `next()` continuation pattern.

```ts
import { runMiddleware } from 'pyrajs-core';

const response = await runMiddleware(
  [authMiddleware, loggingMiddleware],
  context,
  () => handleRoute(context),
);
```

Short-circuits the chain if any middleware returns a `Response` without calling `next()`. Middleware can also modify the response after calling `next()`.

### Request Tracer

Per-request timing using `performance.now()`. Produces W3C `Server-Timing` headers, tree-style terminal logs with bottleneck highlighting, and structured `RequestTrace` objects queryable via the dashboard API.

```ts
import { RequestTracer, shouldTrace } from 'pyrajs-core';

const tracer = new RequestTracer(requestId, pathname);
tracer.start('load');
await loadData();
tracer.end('load');

const trace = tracer.finish();
// trace.stages — array of { name, duration }
// trace.total — total request duration
```

Configure tracing with `trace.production: 'off' | 'header' | 'on'` in your Pyra config. `'header'` only traces requests that include `X-Pyra-Trace: 1`.

### Metrics Store

Singleton that accumulates build metrics, HMR events, dependency graph data, and a ring buffer of request traces (default 200 entries).

```ts
import { metricsStore, measureAsync } from 'pyrajs-core';

const result = await measureAsync('compile', () => compile());

const stats = metricsStore.routeStats();
// { '/blog/[slug]': { avg, p50, p95, p99 } }
```

Exposed at `/_pyra/api/traces` and `/_pyra/api/traces/stats` in the dev server.

---

## Image Optimization Plugin

An opt-in plugin built on [sharp](https://sharp.pixelplumbing.com/) that generates responsive image variants at build time and serves them on-demand in development.

### Installation

```bash
npm install sharp
```

### Setup

```ts
// pyra.config.ts
import { defineConfig } from 'pyrajs-shared';
import { pyraImages } from 'pyrajs-core';

export default defineConfig({
  plugins: [
    pyraImages({
      formats: ['webp', 'avif'],
      sizes: [640, 1280, 1920],
      quality: 80,
    }),
  ],
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `formats` | `['webp']` | Output formats to generate |
| `sizes` | `[640, 1280, 1920]` | Responsive widths in pixels |
| `quality` | `80` | Compression quality, 1–100 |

In development, images in `public/` are optimized on-demand at `/_pyra/image?src=...&w=...&format=...&q=...` with a 60-second in-memory cache.

In production (`pyra build`), every variant is pre-generated into `dist/client/_images/` with content-hashed filenames and recorded in the build manifest. The production server serves them directly with `Cache-Control: immutable`.

If sharp is not installed, the plugin disables itself with a warning and your app continues to work with unoptimized images.

### Low-level optimizer API

```ts
import { isSharpAvailable, getImageMetadata, optimizeImage } from 'pyrajs-core';

if (await isSharpAvailable()) {
  const meta = await getImageMetadata('/path/to/image.jpg');
  // { width, height, format }

  const result = await optimizeImage('/path/to/image.jpg', {
    width: 1280,
    format: 'webp',
    quality: 80,
  });
  // { buffer, width, height, format, size }
}
```

---

## Writing a Plugin

A `PyraPlugin` is an object with lifecycle hooks. All hooks are optional.

```ts
import type { PyraPlugin } from 'pyrajs-shared';

function myPlugin(): PyraPlugin {
  return {
    name: 'my-plugin',

    config(userConfig) {
      // Inspect or mutate the resolved config. Return null to leave it unchanged.
      return null;
    },

    async setup(api) {
      // api.addEsbuildPlugin(plugin)
      // api.getConfig() → PyraConfig
      // api.getMode()   → 'development' | 'production'
    },

    async buildStart() {
      // Runs before esbuild processes any files.
    },

    buildEnd({ manifest, outDir, root }) {
      // Runs after the build. Mutate the manifest to add entries.
    },
  };
}
```

---

## Dependencies

| Package | Role |
|---------|------|
| `esbuild` | JavaScript/TypeScript compilation and bundling |
| `chokidar` | File watching for HMR |
| `ws` | WebSocket server for HMR client communication |
| `pyrajs-shared` | Shared types and utilities |
| `sharp` *(optional peer)* | Image resizing and format conversion |

## License

MIT
