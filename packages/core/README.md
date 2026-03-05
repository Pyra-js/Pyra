# @pyra-js/core

The runtime engine for Pyra.js. Handles file-based route scanning, trie-based routing, the dev server with HMR, the production server, esbuild bundling, the build orchestrator, middleware execution, request context, request tracing, metrics, and image optimization.

> **Internal package.** Application developers do not install this directly - it is a dependency of `@pyra-js/cli`. Install `@pyra-js/cli` to get started.

---

## What's inside

| Module | Description |
|---|---|
| `DevServer` | HTTP + WebSocket server for local development with HMR and on-demand SSR compilation |
| `ProdServer` | Manifest-driven production server with graceful shutdown and optional request tracing |
| `scanRoutes` | Recursive route file discovery — pages, layouts, middleware, error boundaries, 404 |
| `createRouter` | Trie-based URL matcher with static > dynamic > catch-all priority |
| `bundleFile` | esbuild wrapper with in-memory cache and dependency-aware invalidation |
| `build` | Full production build — client bundles, SSR bundles, SSG prerendering, manifest |
| `runMiddleware` | Executes a middleware chain with `next()` continuation |
| `createRequestContext` | Builds the `RequestContext` passed to `load()` and middleware from a Node.js request |
| `RequestTracer` | Per-request timing with W3C `Server-Timing` headers and dashboard integration |
| `metricsStore` | Singleton ring buffer for build metrics, HMR events, and request traces |
| `pyraImages` | Optional image optimization plugin powered by [sharp](https://sharp.pixelplumbing.com/) |

---

## License

MIT
