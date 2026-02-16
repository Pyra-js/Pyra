# Pyra.js Architecture

> Comprehensive technical reference for Pyra.js — a full-stack web framework with file-based routing, server-side rendering, and radical transparency.

---

## 1. What Pyra Is

Pyra.js is a full-stack TypeScript web framework built as a monorepo. It provides file-based routing with SSR, an HMR dev server, esbuild-based production builds, per-request tracing, and a CLI with interactive project scaffolding.

**Three design principles define every decision:**

**App-first, not content-first.** Pyra is built for interactive applications — dashboards, SaaS products, admin panels, real-time tools. Every page fully hydrates by default. SSR runs on every request by default. Static generation is an explicit opt-in per route, not the default mode. No `client:load` directives, no `"use client"` annotations, no partial hydration. Your component renders on the server, hydrates on the client, and works the way you wrote it.

**Zero wrapper syntax.** A `page.tsx` in Pyra IS your React component. Not a file that embeds your component. Not a file that requires framework-specific annotations. The only Pyra-specific concepts are: name your file `page.tsx` so the router finds it, optionally export `load()` for server-side data, optionally export `prerender` for static generation. Everything else is standard React. The framework disappears behind conventions.

**Radical transparency.** Every request in dev mode emits a structured trace showing exactly what happened: which route matched, which middleware ran, how long `load()` took, how long the render took, what assets were injected. Every production build prints a per-route report with bundle sizes, render modes, and asset counts. When something goes wrong, you know where to look instantly.

---

## 2. Monorepo Structure

Five packages with strict build order: **shared -> core -> adapter-react -> cli** (plus `create-pyra` as a standalone scaffolding tool).

```
pyrajs/                          Root workspace (pnpm)
  packages/
    shared/       pyrajs-shared           Types, config loader, logger, net utilities
    core/         pyrajs-core             Router, pipeline, tracer, bundler, build, dev server, prod server
    adapter-react/ pyrajs-adapter-react   React SSR/hydration adapter implementing PyraAdapter
    cli/          pyrajs-cli              CLI commands, scaffolding, graph, doctor, dev/prod banners
    create-pyra/  create-pyra             Standalone "npm create pyra" interactive wizard
  examples/
    pyra-blog/                            Reference full-stack app (SSR, SSG, API, middleware, layouts)
    test-config/                          Config system test app
    basic-ts/                             Minimal TypeScript example
  docs/
    ARCHITECTURE.md                       This file
    CONFIG_SYSTEM.md                      Configuration system docs
    SSR.md                                SSR implementation details
```

**Tech stack:** TypeScript (ES2020 strict, bundler module resolution), tsup for package builds, esbuild for production bundling, Commander.js for CLI, @clack/prompts for interactive wizard, chokidar for file watching, ws for WebSocket HMR, picocolors for terminal output, React 18/19 (peer dep of adapter-react). Node.js >= 18.0.0, ESM output, pnpm workspaces.

---

## 3. Package Details

### 3.1 Shared (`pyrajs-shared`)

Zero heavy dependencies. Owns all cross-package TypeScript type definitions and lightweight utilities.

| Module | Purpose |
|---|---|
| `types.ts` (~807 lines) | All type definitions: `PyraConfig`, `PyraAdapter`, `RouteNode`, `RouteGraph`, `RouteMatch`, `RequestContext`, `RequestTrace`, `Middleware`, `RouteManifest`, `ManifestRouteEntry`, `PageRouteModule`, `APIRouteModule`, `ErrorModule`, `CookieJar`, `CacheConfig`, `PrerenderConfig`, `RenderMode`, etc. |
| `config-loader.ts` | Auto-discovers config files in order: `pyra.config.ts` -> `.js` -> `.mjs` -> `.cjs` -> `.pyrarc.*`. Supports static objects, mode-aware functions (`defineConfigFn`), and async configs. Priority: defaults < config file < CLI flags. |
| `logger.ts` | Minimal colored logger (`log.info`, `log.success`, `log.warn`, `log.error`). |
| `net-utils.ts` | Port finding (`findAvailablePort`), URL resolution (`resolveUrls`), config helpers (`getPort`, `getOutDir`). |
| `index.ts` | Re-exports everything. |

Types live here rather than in core so that `adapter-react` can import contracts without depending on core's esbuild/chokidar weight.

### 3.2 Core (`pyrajs-core`)

The kernel. Responsible for the entire request lifecycle — routing, compilation, data loading, rendering delegation, tracing, and build orchestration. **Core never imports React.** The adapter boundary is sacred.

| Module | Lines | Purpose |
|---|---|---|
| `scanner.ts` | ~464 | File-system route scanner. Walks `src/routes/` discovering `page.tsx` (pages), `route.ts` (APIs), `layout.tsx` (layouts), `middleware.ts` (middleware), `error.tsx` (error boundaries), `404.tsx` (not-found page). Supports dynamic segments `[slug]`, catch-all `[...path]`, and route groups `(name)`. Validates no collisions. Resolves layout/middleware/error ancestry. |
| `router.ts` | ~326 | Trie-based URL matcher. Built from `ScanResult` via `createRouter()`. Priority: static > dynamic > catch-all. Returns `RouteMatch` with route, params, and layout chain. |
| `dev-server.ts` | ~1172 | Unified HTTP + WebSocket server. On-demand compilation via esbuild. SSR pipeline: route match -> compile -> import -> load() -> renderToHTML() -> inject assets -> respond. HMR via WebSocket (full-page reload). Trace API at `/_pyra/api/traces`. Serves `/__pyra_hmr_client` for live reload. Custom 404 and error boundary rendering. Dashboard UI at `/_pyra`. |
| `prod-server.ts` | ~1028 | Production HTTP server. Reads `dist/manifest.json` at startup, builds trie matcher. Serves prerendered HTML as static files, dynamically SSR-renders pages, executes API handlers. Graceful shutdown with `inflightCount` tracking and 10s drain timeout. Conditional request tracing via config. |
| `build.ts` | ~650 | Build orchestrator. Client build: per-page hydration entry wrappers, esbuild code-splitting + content hashing. Server build: SSR entries + API handlers, React externalized. Generates `dist/manifest.json`. SSG prerendering. Enhanced build report with per-route table, shared chunks, gzip estimates, size warnings. |
| `bundler.ts` | ~280 | Wraps esbuild with in-memory cache (5-second TTL). Two compilation targets: server (node platform, React external) and client (browser, bundled). `invalidateDependentCache()` for HMR cache busting. |
| `request-context.ts` | ~282 | Builds `RequestContext` from Node's `IncomingMessage`. Web standard `Request` object, `CookieJar` with Set-Cookie tracking, response helpers (`json()`, `html()`, `redirect()`, `text()`), env var filtering by prefix (default `PYRA_`). Also `createBuildTimeRequestContext()` for SSG. |
| `middleware.ts` | ~80 | `runMiddleware(chain, ctx, finalHandler)` with `next()` continuation pattern. Short-circuits if middleware returns Response without calling `next()`. |
| `tracer.ts` | ~224 | `RequestTracer` class. Per-request timing via `performance.now()`. `start()`/`end()` pairs for pipeline stages. Produces `Server-Timing` headers (W3C format for Chrome DevTools), tree-style terminal logs with bottleneck highlighting (yellow >50%, red >80%), and `RequestTrace` objects. `shouldTrace()` gate for production. |
| `metrics.ts` | ~200 | `MetricsStore` singleton. Ring buffer for traces (default 200), build metrics (last 50), HMR events (last 100), dependency graph data. `routeStats()` computes avg/p50/p95/p99 response times per route. |
| `render-mode.ts` | ~27 | `resolveRouteRenderMode()` — resolves per-route render mode from exports vs global config. Priority: `export const render` > `export const prerender` > global default. |
| `transform.ts` | ~53 | `transformFile()` utility for source transforms. |
| `index.ts` | ~19 | Re-exports all public APIs. |

### 3.3 Adapter React (`pyrajs-adapter-react`)

Implements the `PyraAdapter` interface for React. Depends only on `pyrajs-shared` + `react`/`react-dom` (peer deps).

| Module | Lines | Purpose |
|---|---|---|
| `adapter.ts` | ~116 | `createReactAdapter()` returns a `PyraAdapter`. `renderToHTML()` uses `createElement` + `renderToString()` with layout wrapping (outermost-to-innermost via `createElement` nesting). `getHydrationScript()` generates `hydrateRoot()` code with nested layout imports. `getDocumentShell()` returns HTML template with `<!--pyra-head-->` and `<!--pyra-outlet-->` markers. |
| `index.ts` | 1 | Re-exports `createReactAdapter`. |

### 3.4 CLI (`pyrajs-cli`)

Thin command layer. Parses flags, loads config, resolves adapter, delegates to core.

| Module | Purpose |
|---|---|
| `bin.ts` (~599 lines) | Entry point. Commands: `dev`, `build`, `start`, `init`, `graph`, `doctor`. ASCII logo. Keyboard shortcuts for dev/prod. Auto port detection. Graceful shutdown. |
| `scaffold.ts` | `scaffold()` function. Template copying with `{{PROJECT_NAME}}`/`{{PYRA_VERSION}}` replacement. `.gitignore` generation. Validates project names. |
| `pm.ts` | Package manager detection (npm/pnpm/yarn/bun) via lockfiles -> `npm_config_user_agent` -> PATH -> fallback. `spawnPM()` for command execution. |
| `dashboard.ts` | Build metrics terminal output (file sizes, timing, progress bars). |
| `utils/dev-banner.ts` | Vite-inspired startup banners for dev (red) and prod (green). Capability detection (TTY, color, CI, Unicode). |
| `utils/keyboard.ts` | TTY keyboard shortcuts: `r` restart, `o` open browser, `c` clear, `q` quit, `h` help. |
| `utils/reporter.ts` | Timer, version detection, silent/color mode checks, `withBanner()` wrapper. |
| `utils/tailwind.ts` | Tailwind CSS setup: generates config, PostCSS config, CSS file, injects import, updates deps. Supports basic and shadcn presets. |
| `commands/graph.ts` | Dependency graph visualization. Formats: HTML, SVG, PNG, mermaid, dot, JSON. Workspace detection, cycle detection, filtering. |
| `commands/doctor.ts` | Project diagnostics. Detects mode (Static SPA vs Full-Stack SSR vs Misconfigured), validates config, scans routes. |
| `graph/` | Graph subsystem: `buildGraph.ts`, `detectWorkspaces.ts`, `parseLockfile.ts`, `staticServer.ts`, `types.ts`, `serialize/` (json, mermaid, dot, html formatters). |
| `templates/` | Project templates: `react-ts-fullstack`, `react-js-fullstack`, `react-ts`, `react-js`, `vanilla-ts`, `vanilla-js`. |

### 3.5 Create-Pyra (`create-pyra`)

Standalone interactive project scaffolding wizard invoked via `npm create pyra`.

| Module | Purpose |
|---|---|
| `index.ts` | Main wizard using `@clack/prompts`. 6-step flow with progress indicators: Project name -> Framework (Vanilla/React/Preact) -> Rendering mode (SSR/SPA) -> Variant (TS/JS) -> Tailwind (None/Basic/shadcn) -> Package manager. Summary confirmation screen. Spinner during scaffolding/install. File tree output. |
| `theme.ts` | Color palette constants (`S.brand`, `S.accent`, `S.success`, `S.dim`, etc.), `stepLabel()` for progress indicators, `summaryRow()` for aligned summary display. |
| `tree.ts` | `formatFileTree()` — converts flat file paths into indented, color-coded tree display. |

Templates: `template-react-ts`, `template-react-js`, `template-react-spa-ts`, `template-react-spa-js`, `template-preact-ts`, `template-preact-js`, `template-preact-spa-ts`, `template-preact-spa-js`, `template-vanilla-ts`, `template-vanilla-js`.

---

## 4. Routing System

### 4.1 Directory Conventions

Routes live under `src/routes/` (configurable via `routesDir`). The directory tree maps directly to URL paths.

**Route files (sentinel filenames):**
- `page.tsx` / `page.jsx` — Page route (React component, SSR by default)
- `route.ts` / `route.js` — API route (plain TypeScript, HTTP method handlers)

**Supporting files:**
- `layout.tsx` — Layout component wrapping all pages in its directory and subdirectories. Layouts nest.
- `middleware.ts` — Middleware running before all routes (page + API) in its directory tree. Stacks outermost-first.
- `error.tsx` — Error boundary component for its directory subtree. Nests like layouts.
- `404.tsx` — Custom not-found page (only at routes root).

### 4.2 Naming Conventions

| Convention | Example | URL Pattern |
|---|---|---|
| Static segment | `about/page.tsx` | `/about` |
| Dynamic segment | `blog/[slug]/page.tsx` | `/blog/:slug` |
| Catch-all | `auth/[...path]/route.ts` | `/auth/*path` |
| Route group | `(marketing)/pricing/page.tsx` | `/pricing` (group stripped) |

A directory cannot have both `page.*` and `route.ts` — a URL is either a page or an API endpoint.

### 4.3 Example Directory

```
src/routes/
  page.tsx                    -> GET /
  layout.tsx                  -> Root layout (wraps everything)
  middleware.ts               -> Runs before all routes
  error.tsx                   -> Root error boundary
  404.tsx                     -> Custom 404 page
  about/
    page.tsx                  -> GET /about
  blog/
    page.tsx                  -> GET /blog
    layout.tsx                -> Blog layout (wraps /blog/**)
    [slug]/
      page.tsx                -> GET /blog/:slug
  dashboard/
    middleware.ts             -> Auth middleware for /dashboard/**
    page.tsx                  -> GET /dashboard
    layout.tsx                -> Dashboard layout
    settings/
      page.tsx                -> GET /dashboard/settings
  (marketing)/
    pricing/
      page.tsx                -> GET /pricing
    features/
      page.tsx                -> GET /features
  api/
    health/
      route.ts                -> /api/health (GET)
    users/
      route.ts                -> /api/users (GET, POST)
      [id]/
        route.ts              -> /api/users/:id (GET, PUT, DELETE)
    auth/
      [...path]/
        route.ts              -> /api/auth/* (catch-all)
```

### 4.4 Route Scanner Algorithm

At startup (dev or build):

1. Read adapter's `fileExtensions` to know which `page.*` extensions to recognize.
2. Walk `routesDir` recursively.
3. Per directory: detect `page.*`, `route.ts`, `layout.*`, `middleware.ts`, `error.*`, `404.*`.
4. Strip parenthesized group names from path.
5. Convert `[param]` to `:param`, `[...rest]` to `*rest` in URL pattern.
6. Build `RouteGraph` — flat map of `RouteNode` objects + trie-based matcher.
7. Resolve ancestry: each route knows its layout chain, middleware stack, and error boundary.
8. Validate: no route ID collisions, no mixed page + API in same directory.

### 4.5 Trie-Based Router

`createRouter(scanResult)` builds a trie from scanned routes. At request time, `match(pathname)` traverses the trie with priority: **static > dynamic > catch-all**. Returns `RouteMatch` with:
- `route` — The matched `RouteNode`
- `params` — Extracted URL parameters (`{ slug: 'hello-world' }`)
- `layouts` — Layout chain from outermost to innermost

---

## 5. Route Module Contracts

### 5.1 Page Routes (`page.tsx`)

```typescript
// The ONLY Pyra-specific exports. The default export is a standard React component.
export default function BlogPost({ title, content }: Props) { /* ... */ }

// Optional: server-side data loader
export async function load(ctx: RequestContext) {
  const post = await db.getPost(ctx.params.slug);
  return { title: post.title, content: post.content };
}

// Optional: per-route rendering mode override
export const render: RenderMode = 'ssg';

// Optional: prerender config for SSG with dynamic params
export const prerender = {
  paths: () => slugs.map(s => ({ slug: s }))
};

// Optional: HTTP cache hints
export const cache: CacheConfig = { maxAge: 3600, sMaxAge: 86400 };
```

### 5.2 API Routes (`route.ts`)

```typescript
export async function GET(ctx: RequestContext) {
  const users = await db.getUsers();
  return ctx.json(users);
}

export async function POST(ctx: RequestContext) {
  const body = await ctx.request.json();
  const user = await db.createUser(body);
  return ctx.json(user, { status: 201 });
}
```

Each exported function name corresponds to an HTTP method (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`). Unsupported methods return 405 with an `Allow` header.

### 5.3 Middleware (`middleware.ts`)

```typescript
import type { Middleware } from 'pyrajs-shared';

export default function authMiddleware(ctx, next) {
  const token = ctx.cookies.get('session');
  if (!token) return ctx.redirect('/login');
  return next();
} satisfies Middleware;
```

Middleware can also be a named export: `export { middleware }` or `export const middleware = ...`.

### 5.4 Layouts (`layout.tsx`)

```typescript
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html><body><nav>...</nav>{children}</body></html>
  );
}
```

Layouts nest: root layout wraps all pages, `blog/layout.tsx` wraps only `/blog/**` pages (itself wrapped by root layout).

### 5.5 Error Boundaries (`error.tsx`)

```typescript
import type { ErrorPageProps } from 'pyrajs-shared';

export default function ErrorPage({ message, statusCode, pathname, stack }: ErrorPageProps) {
  return <div><h1>{statusCode}</h1><p>{message}</p></div>;
}
```

Error boundaries nest like layouts. In dev: full message + stack. In prod: generic "Internal Server Error".

---

## 6. Request Pipeline

### 6.1 RequestContext

Built from Node's `IncomingMessage` using Web standard `Request`:

| Field | Description |
|---|---|
| `request` | Web standard `Request` object |
| `url` | Parsed `URL` |
| `params` | Route parameters (`{ slug: 'hello-world' }`) |
| `headers` | Request headers |
| `cookies` | `CookieJar` — parse, get, set, delete. Tracks `Set-Cookie` mutations. |
| `env` | Filtered env vars (prefix `PYRA_`, prefix stripped from keys) |
| `mode` | `'development'` or `'production'` |
| `routeId` | Matched route ID |
| `json()` | Create JSON response |
| `html()` | Create HTML response |
| `redirect()` | Create redirect response |
| `text()` | Create plain text response |

### 6.2 Dev Pipeline (`pyra dev`)

```
Request arrives
  -> Start RequestTracer
  -> Static asset check (public/, /__pyra/*, HMR client)
  -> Route match (trie lookup)
  -> Build RequestContext
  -> Run middleware chain (outermost first, next() continuation)
  -> Branch:
       Page route:
         -> On-demand compile via esbuild + adapter plugins
         -> Import compiled module
         -> Call load(ctx) if exported
           -> If load() returns Response: short-circuit (e.g., redirect)
         -> adapter.renderToHTML(component, data, renderCtx)
         -> Wrap in document shell
         -> Inject: CSS links, client entry, hydration script, HMR client
       API route:
         -> On-demand compile route.ts
         -> Import module
         -> Check HTTP method -> 405 if not exported
         -> Call method handler
       No match:
         -> Render custom 404.tsx or default 404 page
  -> Finalize trace
  -> Set Server-Timing header
  -> Log trace to terminal
  -> Return Response
```

Error handling: any stage that throws is caught. The nearest `error.tsx` boundary is rendered. Dev shows full stack traces; prod shows generic errors.

### 6.3 Prod Pipeline (`pyra start`)

Same flow but no compilation step. All modules are pre-built in `dist/server/`. Prerendered pages are served as static HTML files. Asset injection is manifest-driven (each page gets only the chunks it needs).

### 6.4 Middleware Execution

Middleware stacks outermost-first: root middleware runs before directory middleware. The chain uses the `next()` continuation pattern. A middleware can:
- Call `next()` and return its result (pass-through)
- Modify the response after `next()` returns (post-processing)
- Return a `Response` without calling `next()` (short-circuit, e.g., auth redirect)

Middleware applies to both page and API routes in its subtree.

---

## 7. Build System

### 7.1 Build Orchestrator (`pyra build`)

The build produces three artifacts in `dist/`:

```
dist/
  client/                    Browser assets
    assets/
      page-a1b2c3.js         Content-hashed page entries
      chunk-d4e5f6.js         Shared chunks (code-split)
      page-a1b2c3.css         Extracted CSS
    index.html                Prerendered pages (SSG)
    about/index.html
  server/                    Node SSR modules
    routes/
      _page.js                SSR entry for /
      about/_page.js          SSR entry for /about
      api/users/_route.js     API handler
  manifest.json              Route -> asset mapping
```

**Client build:** Per-page hydration entry wrappers, esbuild with browser target, code splitting enabled, content hashing, CSS extraction, adapter's esbuild plugins applied.

**Server build:** SSR entries (component + load) + API handlers, node target, React externalized, not minified (debuggable).

**Export detection:** esbuild metafile analysis detects `hasLoad` for pages, HTTP methods for APIs.

**SSG prerendering:** For routes with `prerender: true` or `render: 'ssg'`, the build orchestrator imports the SSR entry, calls `load()` with a synthetic `RequestContext`, renders via adapter, injects assets from manifest, and writes static HTML to `dist/client/[path]/index.html`.

### 7.2 Bundler (`bundler.ts`)

Wraps esbuild with an in-memory cache:
- **5-second TTL** for cached build results
- **Two targets:** server (node platform, React external) and client (browser, bundled)
- **Cache invalidation:** `invalidateDependentCache()` on file change for HMR

### 7.3 Build Report

Printed after every `pyra build`:

```
Route                     Type   Mode      JS        CSS      load()  MW  Layouts
-----------------------------------------------------------------------
/                         page   SSR       12.4 KB   2.1 KB   yes     1   root
/about                    page   SSG       8.2 KB    1.8 KB   no      1   root
/blog/[slug]              page   SSG (14)  15.1 KB   2.1 KB   yes     1   root -> blog
/dashboard                page   SSR       22.3 KB   4.2 KB   yes     2   root
/api/health               api    -         -         -        -       1   -
-----------------------------------------------------------------------
Totals                    4 pg   2 SSG     57.5 KB   10.2 KB
                          1 api  16 pre    (gzip: 19.2 KB)

Shared chunks
  chunk-react-vendor.js     42.1 KB   (used by 4 pages)

Output:   dist/client/ (18 files)  dist/server/ (5 files)
Manifest: dist/manifest.json
Built in 1.2s
```

Routes exceeding 50 KB (configurable via `buildReport.warnSize`) get a yellow warning marker.

### 7.4 Route Manifest (`dist/manifest.json`)

Human-readable JSON mapping each route to its built assets:

```typescript
interface RouteManifest {
  version: 1;
  adapter: string;          // 'react'
  base: string;             // '/'
  builtAt: string;          // ISO 8601
  renderMode: RenderMode;   // Global default
  routes: Record<string, ManifestRouteEntry>;
  assets: Record<string, ManifestAsset>;
  spaFallback?: string;     // SPA fallback HTML path
}
```

Each `ManifestRouteEntry` includes: `clientEntry`, `clientChunks`, `css`, `ssrEntry`, `prerendered`, `hasLoad`, `methods` (API), `layoutEntries`, `layoutClientEntries`, `middleware`, `errorBoundaryEntry`, `cache`, `renderMode`.

---

## 8. Transparency Layer

### 8.1 Request Tracer

Every request in dev mode produces a structured trace. The `RequestTracer` class uses `performance.now()` for microsecond-precision timing.

**Terminal output:**
```
GET     /dashboard/settings 200 56ms
  |-- route-match     0.5ms   dashboard/settings/page.tsx
  |-- middleware:root  1.2ms   middleware.ts
  |-- middleware:auth  0.8ms   dashboard/middleware.ts
  |-- compile         0.0ms   (cached)
  |-- load            43.0ms
  |-- render          11.0ms  React SSR
  +-- inject-assets   0.2ms   1 JS, 1 CSS
```

Stages exceeding 50% of total time are highlighted yellow. Stages exceeding 80% are highlighted red.

### 8.2 Server-Timing Header

W3C standard header attached to every traced response. Chrome DevTools Network panel renders it natively as a timing waterfall:

```
Server-Timing: route-match;dur=0.5;desc="dashboard/settings/page.tsx",
  middleware_root;dur=1.2, middleware_auth;dur=0.8,
  load;dur=43.0, render;dur=11.0;desc="React SSR",
  inject-assets;dur=0.2
```

### 8.3 Production Tracing

Controlled by `config.trace.production`:
- `'off'` (default) — No tracing, zero overhead (single boolean check)
- `'header'` — Trace when `X-Pyra-Trace: 1` header is present
- `'on'` — Trace every request (for staging/debugging)

### 8.4 Metrics Store

Singleton collecting:
- Request traces (ring buffer, default 200)
- Build metrics (last 50)
- HMR events (last 100)
- `routeStats()` — avg/p50/p95/p99 response times per route

Accessible via dev dashboard API:
```
GET /_pyra/api/traces         -> Last N traces as JSON
GET /_pyra/api/traces/stats   -> Per-route aggregate stats
GET /_pyra/api/traces/:id     -> Single trace detail
```

---

## 9. Rendering Modes

Pyra supports three rendering modes, configurable globally or per-route:

| Mode | Behavior | When |
|---|---|---|
| **SSR** (default) | Server-renders on every request, hydrates on client | Interactive pages with dynamic data |
| **SSG** | Prerendered to static HTML at build time | Static pages, blog posts with known slugs |
| **SPA** | Serves HTML shell, renders entirely on client | Client-only apps, admin panels behind auth |

**Resolution priority:**
1. `export const render = 'spa' | 'ssr' | 'ssg'` on the route module
2. `export const prerender = true | { paths() }` (legacy SSG marker)
3. Global `renderMode` in `pyra.config.ts`

**Cache-Control:** Routes can export `cache: { maxAge, sMaxAge, staleWhileRevalidate }` for HTTP cache headers. SSR pages without cache config get `Cache-Control: no-cache`. Prerendered pages are served as static files with appropriate caching.

---

## 10. Configuration

Config loader auto-discovers files: `pyra.config.ts` -> `.js` -> `.mjs` -> `.cjs` -> `.pyrarc.*`.

```typescript
import { defineConfig } from 'pyrajs-shared';

export default defineConfig({
  root: '.',
  routesDir: 'src/routes',
  port: 3000,
  adapter: 'react',            // PyraAdapter | string | false
  appContainerId: 'app',
  renderMode: 'ssr',           // Global default: 'ssr' | 'spa' | 'ssg'

  server: { port, host, https, open, hmr, cors, proxy },
  build: { outDir, sourcemap, minify, target, external, splitting, base },
  resolve: { alias, extensions, mainFields, conditions },
  env: { dir, prefix, files },
  plugins: [],

  trace: {
    production: 'off',         // 'off' | 'header' | 'on'
    bufferSize: 200,
  },
  buildReport: {
    warnSize: 51200,           // 50 KB warning threshold
  },
});
```

Mode-aware configs with `defineConfigFn`:

```typescript
import { defineConfigFn } from 'pyrajs-shared';

export default defineConfigFn((mode) => ({
  build: { minify: mode === 'production' },
}));
```

---

## 11. CLI Commands

| Command | Description |
|---|---|
| `pyra dev` | Start dev server with HMR. Options: `--port`, `--open`, `--config`, `--mode`, `--verbose` |
| `pyra build` | Production build. Options: `--out-dir`, `--minify`, `--sourcemap`, `--config`, `--mode`, `--silent` |
| `pyra start` | Production server (requires build first). Options: `--port`, `--config`, `--dist`, `--silent` |
| `pyra init` | Initialize project in current directory. Options: `--template`, `--language`, `--pm`, `--tailwind`, `--ui`, `--skip-install`, `--force` |
| `pyra graph [path]` | Dependency graph visualization. Formats: html/svg/png/mermaid/dot/json. Options: `--format`, `--outfile`, `--open`, `--internal-only`, `--external-only`, `--filter`, `--cycles`, `--stats` |
| `pyra doctor` | Diagnose project setup (mode detection, config validation, route scanning) |
| `npm create pyra` | Interactive project scaffolding wizard (standalone `create-pyra` package) |

### Dev Server Features
- TTY keyboard shortcuts: `r` restart, `o` open browser, `c` clear console, `q` quit, `h` help
- Auto port detection (finds next available if configured port is in use)
- Vite-inspired startup banner with route counts, SSR status, URLs
- Request trace logging to terminal

### Production Server Features
- Graceful shutdown (SIGINT/SIGTERM, 10s drain timeout, 503 during shutdown)
- Manifest-driven asset injection (each page gets only its chunks)
- Immutable cache headers for hashed static assets
- Conditional request tracing

---

## 12. Adapter Interface

The `PyraAdapter` contract that every UI framework adapter must implement:

```typescript
interface PyraAdapter {
  readonly name: string;                    // 'react', 'svelte', etc.
  readonly fileExtensions: readonly string[];  // ['.tsx', '.jsx']

  esbuildPlugins(): Plugin[];               // JSX transform, SFC compilation
  renderToHTML(component, data, context: RenderContext): string | Promise<string>;
  getHydrationScript(clientEntry, containerId, layoutPaths?): string;
  getDocumentShell?(): string;              // HTML template with <!--pyra-outlet-->
}
```

**Boundary rule:** Core calls the adapter through this contract. The adapter never imports core. This ensures adding a new adapter (Svelte, Vue, Solid) requires zero core changes.

**React adapter specifics:**
- `renderToHTML()` uses `createElement` + `renderToString()` with layout nesting
- `getHydrationScript()` generates `hydrateRoot()` with nested layout imports
- Document shell includes `<!--pyra-head-->` and `<!--pyra-outlet-->` placeholders
- Supports layout wrapping: outermost layout wraps innermost via `createElement` composition

---

## 13. Error Handling

### Dev Mode
- `load()` throws -> Nearest `error.tsx` boundary renders with full message + stack trace
- `renderToHTML()` throws -> Error page with stack trace
- Middleware throws -> Error boundary
- API handler throws -> JSON `{ error: "...", stack: "..." }`

### Production Mode
- All errors render generic "Internal Server Error" (no stack traces)
- API errors return `{ error: "Internal Server Error" }` (no details)
- Custom `404.tsx` at routes root for unmatched URLs
- Default styled 404 page if no custom one exists

### Graceful Shutdown (`pyra start`)
- SIGINT/SIGTERM triggers shutdown
- `inflightCount` tracks active requests
- New requests get 503 Service Unavailable during shutdown
- 10-second drain timeout before forced exit

---

## 14. HMR (Hot Module Replacement)

The dev server uses WebSocket-based HMR:
- File watcher (chokidar) monitors `src/routes/` and project files
- On change: invalidate affected route(s) in the compilation cache
- WebSocket message to connected clients triggers full-page reload
- HMR client injected at `/__pyra_hmr_client`

React Fast Refresh is not yet implemented (post-v1.0). Current strategy is full-page reload on any change.

---

## 15. Component Architecture Diagram

```
                    +---------------------------------------------+
                    |                CLI (pyrajs-cli)              |
                    |  dev . build . start . init . graph . doctor |
                    +---------------------+-----------------------+
                                          | invokes
           +------------------------------+----------------------------+
           |                              |                            |
           v                              v                            v
  +------------------+       +-----------------------+     +-------------------+
  |   Dev Server     |       |  Build Orchestrator   |     |  Prod Runtime     |
  |  (unified port)  |       |  (client + server     |     |  (manifest-based  |
  |  on-demand SSR   |       |   bundles + manifest) |     |   request handler)|
  |  HMR + WebSocket |       |  build report output  |     |  graceful shutdown|
  +--------+---------+       +-----------+-----------+     +---------+---------+
           |                             |                           |
           +-------------+-------------  +                           |
                         v                                           |
              +---------------------+                                |
              |    Core Kernel      | <------------------------------+
              |  Router (trie)      |
              |  Request Pipeline   |
              |  Request Tracer     |
              |  Middleware Runner   |
              |  Metrics Store      |
              +----------+----------+
                         | calls via contract
                         v
              +---------------------+
              |   Adapter Layer     |
              |  (React for v1.0)   |
              +----------+----------+
                         | depends on
                         v
              +---------------------+
              |   Shared Types      |
              |  (pyrajs-shared)    |
              |  config . logger    |
              +---------------------+
```

---

## 16. Reference Application: Pyra Blog

Located at `examples/pyra-blog/`. Demonstrates all v1.0 features:

| Route | Feature |
|---|---|
| `/` (SSR) | Home page with data loading |
| `/about` (SSG) | Static prerendered page |
| `/blog` (SSR) | Blog listing with layout |
| `/blog/[slug]` (SSG) | Dynamic SSG with `prerender.paths()` |
| `/dashboard` (SSR) | Auth middleware, dashboard layout |
| `/api/health` | GET-only health check |
| `/api/posts` | CRUD API (GET + POST) |
| `/api/posts/[id]` | Single post API (GET + PUT + DELETE) |
| `error.tsx` | Root error boundary |
| `404.tsx` | Custom not-found page |
| `middleware.ts` (root) | Global middleware |
| `dashboard/middleware.ts` | Auth guard |
| `layout.tsx` (root) | Root layout |
| `blog/layout.tsx` | Blog-specific layout |
| `dashboard/layout.tsx` | Dashboard layout |

---

## 17. Design Tradeoffs

**Web standard Request/Response internally.** Costs a thin conversion layer (Node `IncomingMessage` -> `Request`) but buys portability for future edge/serverless targets. Node 18+ has native `Request`/`Response` support.

**On-demand compilation in dev.** Route modules compile when first requested, not at startup. Keeps startup instant regardless of project size. First request per route is slower (needs compilation), subsequent requests hit cache.

**Layouts are adapter-rendered.** Core tells the adapter which layout chain applies; the adapter composes them. Keeps core out of framework-specific component trees. Each adapter handles nesting naturally (React: JSX composition, Svelte: `<slot/>`).

**No streaming SSR in v1.0.** `renderToHTML()` returns a string, not a stream. Streaming adds complexity (headers sent before body complete, error boundaries differ, asset injection timing changes). Deferred to post-v1.0.

**Single adapter per project.** Multi-adapter (React for some routes, Svelte for others) is architecturally possible but not implemented. Complexity not worth it until single-adapter is rock solid.

**Tracing always-on in dev, opt-in in prod.** Dev: every request traced (negligible overhead, high DX value). Prod: off by default (even small overhead matters at scale), enabled via header or config.

**React-first, not React-only.** Generic `PyraAdapter` interface from day one. Router accepts any file extensions. Core never imports React. But only one adapter ships through v1.0. After v1.0, building `pyrajs-adapter-svelte` validates the architecture.

---

## 18. v1.0 Strategy

Through v1.0, Pyra ships with React as the only supported UI framework. The adapter interface exists in the type system, but no second adapter is built until the core is stable. Reasons:

1. Building one adapter well is hard enough (React SSR has edge cases with error handling, hydration mismatches).
2. The adapter interface will need refinements discovered through real usage.
3. React has the largest user base for early adoption and feedback.

### Post-v1.0 Roadmap
- `pyrajs-adapter-svelte` — First non-React adapter. If it works without modifying core, the architecture is validated.
- `pyrajs-adapter-vue` / `pyrajs-adapter-solid` — Community-buildable against the stable contract.
- Streaming SSR (`renderToStream()` on adapter interface)
- React Fast Refresh HMR
- Client-side navigation (SPA-style transitions between routes)
- Visual dev dashboard
- Edge/serverless deployment targets
- Incremental static regeneration

---

## 19. Build & Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages (shared -> core -> adapter-react -> cli)
pnpm build

# Link CLI globally for testing
pnpm dev:link

# Remove global CLI link
pnpm dev:unlink

# Type checking (project references via tsc -b)
pnpm typecheck

# Clean build artifacts
pnpm clean

# Watch mode for core during development
cd packages/core && pnpm dev

# Run CLI without building
cd packages/cli && pnpm dev:run
```

Individual packages are built with `tsup`. Each can be built independently with `pnpm build` from its directory. The CLI build also runs `scripts/copy-templates.mjs` to copy template files to dist.
