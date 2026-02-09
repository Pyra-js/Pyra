# Pyra Platform Architecture

This document defines the evolution of Pyra from a frontend build tool into a full-stack application platform. It covers Pyra's identity, component boundaries, TypeScript contracts, routing conventions, execution flows, and a 10-step roadmap from v0.1 to v1.0.

---

## Pyra's Identity

Pyra is a full-stack framework that gets out of your way. Three design principles define every decision in this architecture.

**App-first, not content-first.** Pyra is built for interactive applications — dashboards, SaaS products, admin panels, real-time tools. Every page fully hydrates by default. SSR runs on every request by default. Static generation is an explicit opt-in per route, not the default mode. This is the opposite of Astro's islands architecture, where most of the page is static and interactivity is carved out with directives. Pyra assumes your pages are interactive and lets you opt into static when it makes sense. This means no `client:load` directives, no `"use client"` annotations, no partial hydration complexity. Your component renders on the server, hydrates on the client, and works the way you wrote it.

**Zero wrapper syntax.** A `page.tsx` in Pyra IS your React component. Not an `.astro` file that embeds your component. Not a file that requires framework-specific annotations to work. The only Pyra-specific concepts a developer learns are: name your file `page.tsx` so the router finds it, optionally export `load()` if you need server-side data, optionally export `prerender` if you want static generation. Everything else is standard React (and later, standard Svelte, Vue, or Solid). There is no Pyra template language. There is no Pyra component wrapper. The framework disappears behind conventions. This constraint must be enforced ruthlessly — if any feature would require developers to write Pyra-specific syntax inside their components, that feature needs a different design.

**Radical transparency.** Every other full-stack framework is a black box. When a page is slow, you don't know if it's the data fetch, the SSR render, the middleware chain, or the client bundle size. Pyra makes its internals visible by default. Every request in dev mode emits a structured trace showing exactly what happened: which route matched, which middleware ran (and how long each took), how long `load()` took, how long the render took, what assets were injected. Every production build prints a per-route report showing bundle sizes, render mode (SSR/SSG), and asset counts. This isn't a plugin or a debug flag — it's built into the pipeline from day one. The implementation cost is low (timing markers at each pipeline stage, formatting the data that already exists) but the DX impact is high. When something goes wrong, you know where to look instantly.

### v1.0 Strategy: React-First

Through v1.0, Pyra ships with React as the only supported UI framework. The adapter interface exists in the type system and the architecture is designed to support other frameworks, but no second adapter is built or tested until after v1.0 is stable. The reasons:

1. Building one adapter well is hard enough. React SSR has edge cases around Suspense boundaries, error handling during render, streaming (future), and hydration mismatches. Spreading attention across two adapters before the core is stable means both are mediocre.

2. The adapter interface will need refinements discovered through real usage. It's better to discover those refinements with one adapter, adjust the interface, and then build the second adapter against the stable contract.

3. React has the largest user base. Shipping React-first maximizes the chance of early adoption and feedback.

After v1.0, the first post-v1.0 milestone is building `pyrajs-adapter-svelte`. If the Svelte adapter works without modifying core, the framework-agnostic architecture is validated. If core changes are needed, they're interface refinements informed by real usage, not speculative design.

---

## A. Component Architecture

Pyra's architecture separates into seven logical components distributed across the existing monorepo. The central design principle is that **Core owns the request lifecycle and route semantics; the adapter owns UI rendering and framework compilation**. No module in Core ever imports React or assumes JSX syntax.

### Component Map

```
                        ┌─────────────────────────────────────────────┐
                        │                CLI (pyrajs-cli)              │
                        │  dev · build · start · create · init · graph │
                        └────────────────────┬────────────────────────┘
                                             │ invokes
           ┌─────────────────────────────────┼──────────────────────────┐
           │                                 │                          │
           ▼                                 ▼                          ▼
  ┌──────────────────┐         ┌───────────────────────┐   ┌───────────────────┐
  │   Dev Server      │         │  Build Orchestrator   │   │  Prod Runtime     │
  │  (unified port)   │         │  (client + server     │   │  (manifest-based  │
  │  on-demand SSR    │         │   bundles + manifest)  │   │   request handler)│
  │  on-demand build  │         │  build report output   │   │                   │
  │  HMR + WS         │         │                       │   │                   │
  └───────┬───────────┘         └───────────┬───────────┘   └─────────┬─────────┘
          │                                 │                          │
          └──────────────┬──────────────────┘                          │
                         ▼                                             │
              ┌─────────────────────┐                                  │
              │    Core Kernel      │◄─────────────────────────────────┘
              │  Router             │
              │  Request Pipeline   │
              │  Request Tracer     │
              │  Middleware Runner  │
              │  Plugin Host        │
              └─────────┬───────────┘
                        │ calls via contract
                        ▼
              ┌─────────────────────┐
              │   Adapter Layer     │
              │  (React for v1.0)   │
              └─────────┬───────────┘
                        │ depends on
                        ▼
              ┌─────────────────────┐
              │   Shared Types      │
              │  (pyrajs-shared)    │
              │  config · logger    │
              └─────────────────────┘
```

Note the **Request Tracer** in the core kernel. This is not an afterthought or a debug utility — it is a first-class pipeline component that every request passes through. The tracer collects timing data as the request moves through each stage and emits it as `Server-Timing` headers (which Chrome DevTools displays natively) and structured terminal logs.

### Package Layout

Build order: **shared → core → adapter-react → cli**.

```
packages/
  shared/          pyrajs-shared          types, config, logger (expanded with route/adapter/manifest types)
  core/            pyrajs-core            router, pipeline, tracer, build orchestrator, dev server, prod runtime
  adapter-react/   pyrajs-adapter-react   React SSR, hydration, esbuild JSX plugin
  cli/             pyrajs-cli             CLI commands (dev, build, start, create, init, graph)
```

Why not split core into separate packages for build-time vs runtime? Because at v1.0 scale, the overhead of maintaining more packages exceeds the benefit. The prod runtime is a thin code path through core — roughly 200 lines of request handling plus the router. If deployment size becomes a concern later, we can extract it. For now, one `pyrajs-core` with clean internal module boundaries is the right tradeoff: fewer packages to version, fewer integration seams to test.

### Component Responsibilities

**Shared (`pyrajs-shared`)**

Owns all TypeScript type definitions that cross package boundaries: `PyraAdapter`, `RouteModule`, `RouteGraph`, `RouteManifest`, `RequestContext`, `RequestTrace`, `Middleware`, `PyraPlugin`, `PyraConfig`. Also owns the config loader and logger, both unchanged from today. Shared has zero heavy dependencies — just `picocolors`.

Types live here rather than in core so that `adapter-react` can import these contracts without depending on core's esbuild/chokidar weight. The adapter depends only on `shared` plus `react`/`react-dom`.

**Core (`pyrajs-core`)**

The kernel. Responsible for:

1. **Router** — A file-system scanner that walks `src/routes/`, identifies page and API routes by file naming convention, and produces a `RouteGraph`. The router also provides URL matching at request time: given a URL, return the matched `RouteNode` plus extracted params. The router is a pure data structure with no framework awareness. For v1.0 it looks for `.tsx` and `.jsx` files (from the React adapter's `fileExtensions`), but the scanner accepts any extension list.

2. **Request Pipeline** — The sequential execution engine for handling an inbound request. The pipeline is: parse request → start trace → match route → run middleware stack → branch on route type (page or API) → finalize trace → produce response. For page routes, the pipeline calls `load()` on the route module to get server-side data, then delegates to the adapter's `renderToHTML()`, then injects client asset tags. For API routes, the pipeline calls the appropriate HTTP method handler directly. The pipeline uses Web standard `Request`/`Response` objects internally so that future edge/serverless targets don't require a different abstraction.

3. **Request Tracer** — Integrated into the pipeline, not layered on top. Each pipeline stage calls `trace.mark('stage:start')` and `trace.mark('stage:end')`. The tracer produces: (a) a `Server-Timing` response header that Chrome DevTools renders natively, (b) a structured log line to the terminal, and (c) a `RequestTrace` object stored in the metrics system for the dev dashboard. In production, tracing is off by default but can be enabled per-request via a header or globally via config. The tracer adds roughly 15 lines to the pipeline handler — it is not a separate system, it is instrumentation woven into the code that already exists.

4. **Build Orchestrator** — Drives production builds. It performs two esbuild passes: one for client bundles (browser target, code-splitting enabled, adapter's esbuild plugins applied) and one for server bundles (node target, SSR entries + API route handlers). After both passes complete, it generates `dist/manifest.json` mapping each route to its client chunks, CSS files, and SSR entry. If any routes opt into prerendering, the orchestrator invokes the adapter's `renderToHTML()` for those routes and writes static `.html` files into `dist/client/`. After the build completes, the orchestrator prints the **build report** — a per-route table showing bundle sizes, render mode, and asset counts. This report is generated from the manifest data that already exists; it's a formatting function, not a separate analysis pass.

5. **Dev Server** — A single-process HTTP + WebSocket server (evolving from the existing `DevServer` class). In dev mode, it performs on-demand compilation: when a request arrives for a page route, the server compiles the route module and its dependencies through esbuild with the adapter's plugins, runs `load()`, calls `renderToHTML()`, and responds. There is no upfront build step — every route is compiled lazily on first request and cached until a file changes. The WebSocket channel handles HMR: on file change, invalidate the affected route(s) in the cache and notify connected clients. The baseline HMR strategy is full-page reload; the adapter may optionally supply a framework-specific HMR plugin for granular updates (e.g., React Fast Refresh, added post-v1.0).

6. **Prod Runtime** — A lightweight HTTP handler for production. It reads `dist/manifest.json` at startup, builds a lookup table of routes, and handles requests by serving prerendered HTML, dynamically SSR-rendering pages, executing API handlers, or serving static assets from `dist/client/`. The prod runtime uses the same request pipeline as dev, but skips compilation (everything is pre-built) and doesn't start a WebSocket server.

7. **Plugin Host** — Manages the lifecycle of `PyraPlugin` instances. Plugins hook into build events (`buildStart`, `buildEnd`, `transform`), dev server events (`serverStart`), and can register middleware. The plugin host iterates plugins in registration order.

**CLI (`pyrajs-cli`)**

Thin command layer. Gains one new command (`pyra start` for production) alongside the existing `dev`, `build`, `create`, `init`, and `graph`. Each command's job is to parse flags, load config, resolve the adapter, and delegate to core. The CLI never contains routing logic, rendering logic, or pipeline logic.

The `pyra dev` command changes from "start a static file server with HMR" to "start the unified dev server with route-aware SSR." The `pyra build` command changes from "run esbuild on entry points" to "run the build orchestrator (client + server + manifest + report)." Both changes are internal to core; the CLI's role stays the same.

**Adapter Layer (`pyrajs-adapter-react` for v1.0)**

The adapter is a separate package implementing the `PyraAdapter` interface. For v1.0, only the React adapter ships. Its responsibilities:

1. Declare file extensions it handles: `['.tsx', '.jsx']`.
2. Provide the esbuild JSX plugin (esbuild's built-in JSX transform configured for `react-jsx`).
3. Implement `renderToHTML()`: calls `renderToString()` from `react-dom/server`, passing the component and its data as props.
4. Provide `getHydrationScript()`: emits a `hydrateRoot()` call that imports the client entry and mounts it.
5. Optionally provide a document shell with `<!--pyra-outlet-->` and `<!--pyra-head-->` placeholders.

The adapter does NOT own routing, request parsing, middleware execution, or build orchestration. It is a pure rendering engine that core calls through a stable contract.

**Why this boundary matters even with only one adapter:** The boundary prevents React-specific assumptions from leaking into core. When we build the Svelte adapter post-v1.0, core requires zero changes if this boundary was maintained. Every time you're tempted to `import React from 'react'` in core, that's a boundary violation.

---

## B. TypeScript Interfaces

### PyraAdapter

```typescript
import type { Plugin as EsbuildPlugin } from 'esbuild';

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
   * The plugins handle syntax transformation only (JSX, SFC compilation, etc.).
   */
  esbuildPlugins(): EsbuildPlugin[];

  /**
   * Server-side render a page component to an HTML fragment (the page body).
   * Core wraps the fragment in the document shell and injects asset tags.
   *
   * @param component - The route module's default export (opaque to core).
   * @param data      - The return value of the route's load() function.
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
   * @param clientEntryPath - The URL path to the client-side entry chunk.
   * @param containerId     - The DOM element ID where the app is mounted.
   */
  getHydrationScript(clientEntryPath: string, containerId: string): string;

  /**
   * Return the HTML for the document shell that wraps rendered page content.
   * If not provided, core uses a sensible default shell.
   * The shell MUST include the placeholder <!--pyra-outlet--> where page
   * body HTML will be injected, and <!--pyra-head--> for head tags.
   */
  getDocumentShell?(): string;

  /** Optional esbuild plugin for framework-specific HMR (e.g., React Fast Refresh). */
  hmrPlugin?(): EsbuildPlugin;

  /** Called once when the build starts. Set up caches, warm compilers, etc. */
  buildStart?(): Promise<void> | void;

  /** Called after build completes. Cleanup, final validation, etc. */
  buildEnd?(manifest: RouteManifest): Promise<void> | void;
}

/**
 * Passed to renderToHTML so adapters can set <head> tags from inside
 * the render pass (titles, meta, link preloads, etc.).
 */
export interface RenderContext {
  url: URL;
  params: Record<string, string>;
  /** Adapters call this to append tags into <head>. */
  pushHead(tag: string): void;
}
```

### RouteModule Contracts

```typescript
/**
 * The export shape core expects from a page route file (e.g., page.tsx).
 * Core imports the module and accesses these named exports.
 * The `default` export is opaque — core passes it to the adapter's renderToHTML.
 *
 * ZERO WRAPPER SYNTAX RULE: These are the ONLY Pyra-specific exports.
 * The default export is a standard React component (or Svelte/Vue component).
 * Developers never write Pyra-specific code inside the component itself.
 */
export interface PageRouteModule {
  /** The page component. Core never inspects this; it's the adapter's input. */
  default: unknown;

  /**
   * Server-side data loader. Runs on every request (SSR) or at build time (SSG).
   * Its return value is passed to the adapter's renderToHTML as `data`,
   * and injected into the client as serialized JSON for hydration.
   */
  load?: (context: RequestContext) => Promise<unknown> | unknown;

  /**
   * Prerender configuration for SSG.
   * - true: prerender at build time with no params.
   * - PrerenderConfig: supply a list of param sets to prerender.
   * - Absent or false: SSR at request time (the app-first default).
   */
  prerender?: boolean | PrerenderConfig;

  /** HTTP cache-control hints for this route. */
  cache?: CacheConfig;

  /** Static metadata (page title, description) used in the document shell. */
  metadata?: RouteMetadata;
}

export interface PrerenderConfig {
  /** Return the set of param objects to prerender. */
  paths(): Promise<Record<string, string>[]> | Record<string, string>[];
}

export interface CacheConfig {
  /** Cache-Control max-age in seconds. */
  maxAge?: number;
  /** Cache-Control s-maxage in seconds (CDN TTL). */
  sMaxAge?: number;
  /** stale-while-revalidate window in seconds. */
  staleWhileRevalidate?: number;
}

export interface RouteMetadata {
  title?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * The export shape core expects from an API route file (e.g., route.ts).
 * Each exported function name corresponds to an HTTP method.
 * API route files are always plain TypeScript — no framework imports.
 */
export interface APIRouteModule {
  GET?: (context: RequestContext) => Response | Promise<Response>;
  POST?: (context: RequestContext) => Response | Promise<Response>;
  PUT?: (context: RequestContext) => Response | Promise<Response>;
  DELETE?: (context: RequestContext) => Response | Promise<Response>;
  PATCH?: (context: RequestContext) => Response | Promise<Response>;
  HEAD?: (context: RequestContext) => Response | Promise<Response>;
  OPTIONS?: (context: RequestContext) => Response | Promise<Response>;

  /**
   * Route-level middleware applied before the method handler.
   * Stacks on top of directory-level middleware.
   */
  middleware?: Middleware[];
}
```

### RequestContext

```typescript
/**
 * Passed to load() functions, API handlers, and middleware.
 * Built from Web standard Request and enriched with Pyra's routing data.
 * Uses the Web standard Response for output so the pipeline is portable
 * to serverless/edge runtimes in the future.
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

  // --- Response helpers (convenience, not required) ---

  /** Create a JSON response. */
  json(data: unknown, init?: ResponseInit): Response;

  /** Create an HTML response. */
  html(body: string, init?: ResponseInit): Response;

  /** Create a redirect response. */
  redirect(url: string, status?: number): Response;

  /** Create a plain text response. */
  text(body: string, init?: ResponseInit): Response;
}

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
  sameSite?: 'strict' | 'lax' | 'none';
}
```

### RequestTrace (Transparency Layer)

```typescript
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
}

export interface TraceStage {
  /** Stage name: 'route-match', 'middleware:auth', 'load', 'render', 'inject-assets'. */
  name: string;

  /** Duration of this stage in milliseconds. */
  durationMs: number;

  /** Optional detail (e.g., middleware file path, load() data source). */
  detail?: string;
}

/**
 * Utility for building traces inside the request pipeline.
 * Instantiated at the start of each request, finalized before response.
 */
export interface RequestTracer {
  /** Mark the start of a named stage. */
  start(name: string, detail?: string): void;

  /** Mark the end of the most recently started stage. */
  end(): void;

  /** Finalize the trace and return the completed RequestTrace. */
  finalize(status: number): RequestTrace;

  /**
   * Format the trace as a Server-Timing header value.
   * e.g., "route-match;dur=0.5, middleware;dur=2.1, load;dur=43, render;dur=11"
   */
  toServerTiming(): string;

  /**
   * Format the trace as a compact terminal log line.
   * e.g., "GET /dashboard/settings 200 56ms (load:43ms render:11ms)"
   */
  toLogLine(): string;
}
```

### Middleware

```typescript
/**
 * Middleware receives the request context and a next() function.
 * Call next() to continue the pipeline; return a Response to short-circuit.
 */
export type Middleware = (
  context: RequestContext,
  next: () => Promise<Response>,
) => Promise<Response> | Response;
```

### RouteGraph

```typescript
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

export interface RouteNode {
  /** Unique ID derived from file path: '/blog/[slug]'. */
  id: string;

  /** URL pattern for matching: '/blog/:slug'. */
  pattern: string;

  /** Absolute path to the route file on disk. */
  filePath: string;

  /** 'page' for page.* files, 'api' for route.ts files. */
  type: 'page' | 'api';

  /** Dynamic parameter names: ['slug']. */
  params: string[];

  /** Whether this is a catch-all route ([...rest]). */
  catchAll: boolean;

  /** ID of the nearest ancestor layout, if any. */
  layoutId?: string;

  /** Paths to middleware files that apply to this route (nearest-first). */
  middlewarePaths: string[];

  /** Child route IDs (for layout nesting visualization). */
  children: string[];
}

export interface RouteMatch {
  /** The matched route node. */
  route: RouteNode;

  /** Extracted URL parameters. */
  params: Record<string, string>;

  /**
   * Layout chain from outermost to innermost.
   * Core passes this to the adapter so it can nest layouts around the page.
   */
  layouts: RouteNode[];
}

export interface SerializedRouteGraph {
  nodes: Record<string, Omit<RouteNode, 'children'> & { children: string[] }>;
}
```

### RouteManifest (Build Output)

```typescript
/**
 * Written to dist/manifest.json by the build orchestrator.
 * Read by the prod runtime at startup to map routes to built assets.
 * Designed to be human-readable — a developer should be able to open
 * this file and understand exactly what was built.
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
```

### PyraPlugin (Expanded)

```typescript
/**
 * Evolved from the existing PyraPlugin type.
 * Adds request-time hooks alongside the existing build-time hooks.
 */
export interface PyraPlugin {
  /** Unique plugin name. */
  name: string;

  /**
   * Modify config before resolution. Return a partial config to merge,
   * or null to leave unchanged.
   */
  config?: (
    config: PyraConfig,
    mode: PyraMode,
  ) => Partial<PyraConfig> | null | Promise<Partial<PyraConfig> | null>;

  /** Called once when the build/dev pipeline initializes. */
  setup?: (api: PluginAPI) => void | Promise<void>;

  /** Transform a module's source code. Return null to skip. */
  transform?: (
    code: string,
    id: string,
  ) => TransformResult | null | Promise<TransformResult | null>;

  /** Called before build starts. */
  buildStart?: () => void | Promise<void>;

  /** Called after build completes. */
  buildEnd?: (manifest: RouteManifest) => void | Promise<void>;

  /** Called when dev server starts listening. */
  serverStart?: (info: { port: number; hostname: string }) => void | Promise<void>;

  /**
   * Register request-time middleware.
   * Runs in plugin registration order, before route-level middleware.
   */
  middleware?: Middleware;
}

export interface PluginAPI {
  /** Register an esbuild plugin into the build pipeline. */
  addEsbuildPlugin(plugin: EsbuildPlugin): void;

  /** Get resolved config. */
  getConfig(): PyraConfig;

  /** Get current mode. */
  getMode(): PyraMode;

  /** Get the route graph (available after route scanning). */
  getRouteGraph(): RouteGraph;
}

export interface TransformResult {
  code: string;
  map?: unknown;
}
```

### Updated PyraConfig

```typescript
/**
 * User-facing configuration. Extends the existing PyraConfig with
 * new fields for the platform features.
 */
export interface PyraConfig {
  // --- Existing fields (unchanged) ---
  entry?: string | string[] | Record<string, string>;
  outDir?: string;
  port?: number;
  mode?: PyraMode;
  root?: string;
  server?: DevServerConfig;
  build?: BuildConfig;
  resolve?: ResolveConfig;
  env?: EnvConfig;
  plugins?: PyraPlugin[];
  define?: Record<string, any>;
  features?: FeatureFlags;
  esbuild?: Record<string, any>;

  // --- New fields ---

  /**
   * The UI framework adapter.
   * Can be a string (resolved from pyrajs-adapter-<name>) or an adapter object.
   * Default: 'react' (for v1.0).
   * When set to false, Pyra runs in API-only mode (no page routes).
   */
  adapter?: string | PyraAdapter | false;

  /**
   * Directory containing route files, relative to root.
   * Default: 'src/routes'
   */
  routesDir?: string;

  /**
   * The DOM element ID where the app mounts on the client.
   * Default: 'app'
   */
  appContainerId?: string;

  /**
   * SSR configuration.
   */
  ssr?: {
    /** Disable SSR entirely (client-only SPA mode). Default: false. */
    disabled?: boolean;
    /** External packages to exclude from SSR bundle. */
    external?: string[];
  };

  /**
   * Transparency / tracing configuration.
   */
  trace?: {
    /**
     * Enable request tracing in production.
     * 'off' = no tracing (default in prod).
     * 'header' = trace when X-Pyra-Trace header is present.
     * 'on' = trace every request.
     * In dev mode, tracing is always on regardless of this setting.
     */
    production?: 'off' | 'header' | 'on';
  };

  // The existing `framework` field is deprecated in favor of `adapter`.
}
```

---

## C. Routing Conventions

### Directory Structure

Routes live under `src/routes/` by default (configurable via `routesDir`). The directory tree maps directly to URL paths. Two sentinel filenames distinguish route types:

- **`page.tsx`** (or `.jsx`) — A page route. For v1.0 this is always React. The file extension comes from the adapter's `fileExtensions` list. Post-v1.0, this could be `page.svelte` or `page.vue` with the appropriate adapter.
- **`route.ts`** (or `.js`) — An API route. Always plain TypeScript/JavaScript. Never contains UI framework imports.

Supporting files that are not routes themselves:

- **`layout.tsx`** — A layout component that wraps all page routes in its directory and subdirectories. Layouts nest: a layout in `blog/` wraps pages inside `blog/`, which is itself wrapped by the root layout.
- **`middleware.ts`** — Middleware that runs before all routes (page and API) in its directory and subdirectories. Middleware stacks: inner middleware runs after outer middleware.
- **`error.tsx`** — An error boundary component displayed when a route's `load()` or render throws. Adapter renders it.
- **`loading.tsx`** — A loading/suspense component (future, for streaming SSR).

### Example

```
src/routes/
├── page.tsx                    →  GET /
├── layout.tsx                  →  Root layout (wraps everything)
├── middleware.ts               →  Runs before all routes
├── about/
│   └── page.tsx                →  GET /about
├── blog/
│   ├── page.tsx                →  GET /blog
│   ├── layout.tsx              →  Blog layout (wraps /blog/**)
│   └── [slug]/
│       └── page.tsx            →  GET /blog/:slug
├── dashboard/
│   ├── middleware.ts           →  Auth middleware for /dashboard/**
│   ├── page.tsx                →  GET /dashboard
│   └── settings/
│       └── page.tsx            →  GET /dashboard/settings
├── (marketing)/
│   ├── pricing/
│   │   └── page.tsx            →  GET /pricing  (group doesn't affect URL)
│   └── features/
│       └── page.tsx            →  GET /features
└── api/
    ├── health/
    │   └── route.ts            →  /api/health  (GET, POST, etc.)
    ├── users/
    │   ├── route.ts            →  /api/users
    │   └── [id]/
    │       └── route.ts        →  /api/users/:id
    └── auth/
        └── [...path]/
            └── route.ts        →  /api/auth/*  (catch-all)
```

### Naming Rules

**Dynamic segments** use square brackets: `[slug]` maps to `:slug` in the URL pattern. The directory name becomes the parameter name.

**Catch-all segments** use spread syntax: `[...path]` matches one or more trailing segments. The parameter value is the slash-separated remainder (e.g., for `/api/auth/callback/github`, `params.path` is `"callback/github"`).

**Route groups** use parentheses: `(marketing)` is purely organizational — it creates a directory that does not contribute a URL segment. This lets you share layouts or middleware across routes without adding a path prefix.

**The `api/` directory has no special treatment at the router level.** It's just a conventional prefix. A `route.ts` file can appear anywhere in the tree, not only under `api/`. The sentinel filename (`page.*` vs `route.ts`) determines the route type, not the directory name.

### Route Scanning Algorithm

At startup (dev or build), core's route scanner:

1. Reads the adapter's `fileExtensions` to know which `page.*` extensions to look for.
2. Walks the `routesDir` recursively.
3. For each directory, checks for `page.*`, `route.ts`, `layout.*`, `middleware.ts`, `error.*`.
4. Strips parenthesized group names from the path.
5. Converts `[param]` directories to `:param` in the URL pattern.
6. Converts `[...rest]` directories to a wildcard pattern.
7. Builds the `RouteGraph` — a flat map of `RouteNode` objects plus a trie-based matcher for efficient URL lookup.
8. Validates: no route ID collisions, no mixed `page.*` + `route.ts` in the same directory (you can't have a page route and an API route at the same URL).

### Why page.\* and route.ts, Not File Extensions Alone

A project might have `.tsx` files that are utility components, not routes. Relying on extension alone would require scanning all files and guessing which are routes. The sentinel filename convention (`page`, `route`) makes intent explicit and keeps the scanner fast — it only needs to check for specific filenames per directory, not parse file contents. This also enforces the zero-wrapper-syntax principle: your page IS the component, named `page.tsx`, with no wrapping boilerplate.

---

## D. Execution Flows

### Dev Flow (`pyra dev`)

```
┌───────────────────────────────────────────────────────────────────────┐
│ 1. CLI parses flags, calls loadConfig()                               │
│ 2. Resolve adapter (default: React for v1.0)                         │
│ 3. Scan src/routes/ → build RouteGraph                                │
│ 4. Initialize plugin host, call plugin.setup() for each plugin        │
│ 5. Start unified HTTP + WebSocket server on config.port               │
│ 6. Start chokidar watcher on src/routes/ and src/**                   │
│ 7. Log: route table showing all discovered routes                     │
└───────────────────────┬───────────────────────────────────────────────┘
                        │
              ┌─────────▼──────────┐
              │    Request arrives  │
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  Start request     │
              │  tracer            │
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  Static asset?     │──yes──▶ Serve from public/ or compiled
              │  (public/, *.css,  │         asset. Finalize trace. Done.
              │   *.png, etc.)     │
              └─────────┬──────────┘
                        │ no
              ┌─────────▼──────────┐
              │  Match RouteGraph  │──no───▶ 404 Response + trace log
              └─────────┬──────────┘
                        │ matched (trace: route-match stage)
              ┌─────────▼──────────┐
              │  Build RequestCtx  │  (url, params, headers, cookies, env)
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  Run middleware     │  (plugin middleware → directory middleware
              │  stack              │   → route middleware, outermost first)
              │                    │  (trace: each middleware as named stage)
              └─────────┬──────────┘
                        │
                ┌───────┴────────┐
                │                │
         ┌──────▼──────┐  ┌─────▼──────┐
         │  Page route  │  │  API route  │
         └──────┬───────┘  └─────┬──────┘
                │                │
    ┌───────────▼──────────┐     │  Import route module (on-demand compile)
    │ On-demand compile    │     │  Call handler for HTTP method (GET, POST…)
    │ route module via     │     │  (trace: 'handler' stage)
    │ esbuild + adapter    │     │  Return Response. Done.
    │ plugins              │     │
    │ (trace: 'compile')   │     │
    └───────────┬──────────┘     │
                │                │
    ┌───────────▼──────────┐     │
    │ Call load(ctx) if    │     │
    │ exported             │     │
    │ (trace: 'load')      │     │
    └───────────┬──────────┘     │
                │                │
    ┌───────────▼──────────┐     │
    │ adapter.renderToHTML( │     │
    │   component, data,   │     │
    │   renderCtx)         │     │
    │ (trace: 'render')    │     │
    └───────────┬──────────┘     │
                │                │
    ┌───────────▼──────────┐     │
    │ Wrap in document     │     │
    │ shell, inject:       │     │
    │  - CSS links         │     │
    │  - Client entry      │     │
    │  - Hydration script  │     │
    │  - HMR client script │     │
    │ (trace: 'inject')    │     │
    └───────────┬──────────┘     │
                │                │
                └───────┬────────┘
                        │
              ┌─────────▼──────────┐
              │ Finalize trace     │
              │ Set Server-Timing  │
              │ header             │
              │ Log trace line to  │
              │ terminal           │
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  Return Response   │
              └────────────────────┘
```

**Terminal output example (dev mode):**

```
  GET /dashboard/settings 200 56ms
    ├─ route-match     0.5ms   dashboard/settings/page.tsx
    ├─ middleware:root  1.2ms   middleware.ts
    ├─ middleware:auth  0.8ms   dashboard/middleware.ts
    ├─ load            43.0ms
    ├─ render          11.0ms  React SSR
    └─ inject-assets   0.2ms   1 JS · 1 CSS
```

This happens automatically. No debug flag. No plugin. Every request in dev mode logs its trace to the terminal.

**File Change Handling (Dev)**

When chokidar detects a change:

1. Determine which route(s) the changed file belongs to (direct route file, or dependency of a route module).
2. Invalidate the on-demand compile cache for those routes.
3. If the changed file is a `middleware.ts` or `layout.*`, invalidate all routes in that subtree.
4. If the changed file is inside `src/routes/` and is a new/deleted `page.*` or `route.ts`, re-scan and rebuild the RouteGraph.
5. Send an HMR event over WebSocket. Baseline strategy: `{ type: 'reload' }` (full page reload).

### Build Flow (`pyra build`)

```
┌───────────────────────────────────────────────────────────────────────┐
│ 1. CLI parses flags, calls loadConfig({ mode: 'production' })         │
│ 2. Resolve adapter                                                    │
│ 3. Scan src/routes/ → build RouteGraph                                │
│ 4. Call adapter.buildStart() and plugin.buildStart()                  │
└───────────────────────┬───────────────────────────────────────────────┘
                        │
              ┌─────────▼──────────────────────────────┐
              │  Client Build (esbuild, browser target) │
              │                                         │
              │  Entry points: one per page route       │
              │    (a small wrapper that imports the    │
              │     component + calls hydrate)          │
              │  Plugins: adapter.esbuildPlugins()      │
              │  Code splitting: enabled                │
              │  Output: dist/client/**                 │
              │  Assets: CSS, images, fonts copied      │
              └─────────┬──────────────────────────────┘
                        │
              ┌─────────▼──────────────────────────────┐
              │  Server Build (esbuild, node target)    │
              │                                         │
              │  Entry points:                          │
              │    - One SSR entry per page route       │
              │      (exports component + load)         │
              │    - One entry per API route             │
              │  Plugins: adapter.esbuildPlugins()      │
              │  External: node builtins, configured    │
              │  Output: dist/server/**                 │
              └─────────┬──────────────────────────────┘
                        │
              ┌─────────▼──────────────────────────────┐
              │  Generate dist/manifest.json            │
              │                                         │
              │  Map each route to its client chunks,   │
              │  CSS files, SSR entry, and metadata.    │
              │  Include asset inventory with hashes.   │
              └─────────┬──────────────────────────────┘
                        │
              ┌─────────▼──────────────────────────────┐
              │  Prerender static routes (SSG)          │
              │                                         │
              │  For each page with prerender: true:    │
              │    - Import SSR entry                   │
              │    - Call load() (if any)               │
              │    - Call adapter.renderToHTML()         │
              │    - Write HTML to dist/client/         │
              │    - Mark prerendered in manifest       │
              └─────────┬──────────────────────────────┘
                        │
              ┌─────────▼──────────────────────────────┐
              │  Call adapter.buildEnd(manifest)         │
              │  Call plugin.buildEnd(manifest)          │
              └─────────┬──────────────────────────────┘
                        │
              ┌─────────▼──────────────────────────────┐
              │  Print build report (always)             │
              └─────────────────────────────────────────┘
```

**Build report output:**

```
pyra build

  Route                     Type   Mode      JS        CSS      load()
  ─────────────────────────────────────────────────────────────────────
  /                         page   SSR       12.4 KB   2.1 KB   yes
  /about                    page   SSG       8.2 KB    1.8 KB   no
  /blog                     page   SSR       9.1 KB    2.1 KB   yes
  /blog/[slug]              page   SSG (14)  15.1 KB   2.1 KB   yes
  /dashboard                page   SSR       22.3 KB   4.2 KB   yes
  /dashboard/settings       page   SSR       18.7 KB   3.8 KB   yes
  /api/health               api    —         —         —        —
  /api/users                api    —         —         —        —
  /api/users/[id]           api    —         —         —        —
  ─────────────────────────────────────────────────────────────────────
  Totals                    6 pg   2 SSG     85.8 KB   16.1 KB
                            3 api  16 pre    (gzip: 28.6 KB)

  Output:   dist/client/ (22 files)  dist/server/ (9 files)
  Manifest: dist/manifest.json
  Built in 1.2s
```

This report prints after every build. No flag needed. The data comes directly from the manifest and esbuild metafile — no separate analysis pass.

**Output Structure:**

```
dist/
├── client/
│   ├── assets/
│   │   ├── page-a1b2c3.js        (page client entry, hashed)
│   │   ├── chunk-d4e5f6.js       (shared chunk)
│   │   ├── page-a1b2c3.css       (extracted CSS)
│   │   └── logo.png              (static asset)
│   ├── index.html                (prerendered, if applicable)
│   └── about/
│       └── index.html            (prerendered)
├── server/
│   ├── routes/
│   │   ├── _page.js              (SSR entry for /)
│   │   ├── about/_page.js        (SSR entry for /about)
│   │   ├── blog/[slug]/_page.js
│   │   └── api/users/_route.js   (API handler)
│   └── entry.js                  (server bootstrap, imports manifest)
└── manifest.json
```

### Prod Flow (`pyra start`)

```
┌───────────────────────────────────────────────────────────────────────┐
│ 1. CLI calls loadConfig({ mode: 'production' })                       │
│ 2. Read dist/manifest.json                                            │
│ 3. Build route lookup table from manifest routes                      │
│ 4. Resolve adapter (for dynamic SSR routes)                           │
│ 5. Start HTTP server on config.port                                   │
└───────────────────────┬───────────────────────────────────────────────┘
                        │
              ┌─────────▼──────────┐
              │  Request arrives    │
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  Static asset?     │──yes──▶ Serve from dist/client/
              │  (hashed files,    │         with immutable cache headers.
              │   public/ assets)  │         Done.
              └─────────┬──────────┘
                        │ no
              ┌─────────▼──────────┐
              │  Match manifest    │──no───▶ 404
              │  routes            │
              └─────────┬──────────┘
                        │ matched
              ┌─────────▼──────────┐
              │  Build RequestCtx  │
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  Run middleware     │
              └─────────┬──────────┘
                        │
            ┌───────────┴────────────┐
            │                        │
     ┌──────▼───────┐        ┌──────▼──────┐
     │ Prerendered?  │        │  API route   │
     │ page route    │        │              │
     └──────┬───────┘        └──────┬──────┘
            │                        │
       yes──┤──no                    │ Import dist/server/…/route.js
            │    │                   │ Call method handler
            │    │                   │ Return Response. Done.
   Serve    │    │
   static   │    │
   HTML     │  ┌─▼──────────────┐
   from     │  │ Dynamic SSR    │
   dist/    │  │                │
   client/  │  │ Import SSR     │
   Done.    │  │ entry from     │
            │  │ dist/server/   │
            │  │ Call load(ctx) │
            │  │ Render via     │
            │  │ adapter        │
            │  │ Inject client  │
            │  │ chunks from    │
            │  │ manifest       │
            │  │ Return HTML    │
            │  └────────────────┘
            │
            └──────────────────▶ Done.
```

The prod server does not bundle or compile anything. All compilation happened during `pyra build`. The server's job is matching URLs, running middleware, importing pre-built modules, and producing responses. This makes prod startup fast and predictable.

---

## E. Roadmap: v0.1 → v1.0

Ten milestones. Each builds on the previous. React is the only adapter through v1.0. Other adapters follow post-v1.0 once the core contracts are proven stable.

---

### v0.1 — Core Router

**Goal:** Build the route scanner and URL matcher as a standalone module with no dependencies on the existing dev server or build system. This is the foundation everything else sits on.

**Scope:** Implement the route scanner that walks `src/routes/` and produces a `RouteGraph`. Implement the trie-based URL matcher that takes a pathname and returns a `RouteMatch` with extracted params. Support static segments (`about/`) and dynamic segments (`[slug]/`). Recognize `page.tsx`/`page.jsx` as page routes and `route.ts`/`route.js` as API routes. Detect `layout.tsx` and `middleware.ts` files and attach them to the correct nodes. Validate that no directory has both `page.*` and `route.ts`.

**Does not include:** Catch-all routes, route groups, dev server integration, SSR, build pipeline.

**Acceptance criteria:**
1. Given a `src/routes/` directory tree, the scanner produces a correct `RouteGraph` with all expected nodes.
2. The matcher correctly resolves `/blog/hello-world` to the `[slug]` route with `params.slug === 'hello-world'`.
3. Layout and middleware ancestry is correctly computed for nested routes.
4. The module is independently testable with unit tests — no HTTP server or esbuild required.

---

### v0.2 — Unified Dev Server + React SSR

**Goal:** The "hello world" moment. Run `pyra dev`, visit `localhost:3000`, and see a server-rendered React page that hydrates on the client. This replaces the existing static-file-serving dev server with the route-aware pipeline.

**Scope:** Create the `pyrajs-adapter-react` package. Implement `renderToHTML()` using `react-dom/server`'s `renderToString()`. Implement `getHydrationScript()` that emits a `hydrateRoot()` call. Provide the esbuild JSX plugin.

Refactor the existing `DevServer` to use the v0.1 router. On page route match, on-demand compile the route module via esbuild with the adapter's plugins, import the compiled module, call `renderToHTML()` on the default export, wrap in a basic document shell, inject the hydration script and client entry `<script>` tag. On API route match, respond with 501 (not yet implemented). On no match, fall through to static file serving (existing behavior for `public/` assets), then 404.

Keep the existing WebSocket HMR with full-page reload — no React Fast Refresh yet.

**Does not include:** `load()` data loading, production build, middleware, layouts, tracing.

**Acceptance criteria:**
1. A `src/routes/page.tsx` exporting a React component renders as HTML on the server and hydrates interactively on the client.
2. A `src/routes/about/page.tsx` works at `/about`.
3. A `src/routes/blog/[slug]/page.tsx` works at `/blog/anything`, and the component can read the slug from a prop (hardcoded for now — no `load()` yet).
4. `pyrajs-core` does not import `react` or `react-dom` anywhere.
5. Editing a component and saving triggers a full-page reload via existing HMR.

---

### v0.3 — Data Loading + RequestContext

**Goal:** Server-side data loading works. The `load()` export is the primary mechanism for getting data into pages, and this milestone makes it functional.

**Scope:** Implement `RequestContext` construction from Node's `IncomingMessage` using the Web standard `Request` object. Implement the `CookieJar`, response helpers (`ctx.json()`, `ctx.html()`, `ctx.redirect()`, `ctx.text()`), and environment variable filtering.

In the dev server pipeline, after matching a page route and compiling the module, check for a `load` export. If present, construct a `RequestContext`, call `load(ctx)`, and pass the return value to `adapter.renderToHTML()` as the `data` argument. Serialize the data as JSON and inject it into the HTML as a `<script>` tag so the client can hydrate with the same data.

Update the React adapter's `renderToHTML()` to accept data and pass it to the component as props.

**Does not include:** Production build, API route handlers, middleware, prerendering.

**Acceptance criteria:**
1. A page route with `export async function load(ctx) { return { posts: [...] } }` receives the data in the component as props during both SSR and client hydration.
2. `load()` receives a `RequestContext` with `url`, `params`, `headers`, and `cookies` correctly populated.
3. Dynamic routes work with data: `/blog/hello-world` calls `load()` with `params.slug === 'hello-world'`, and the component renders the loaded data.
4. Data is serialized into the HTML and available on the client without a second fetch.

---

### v0.4 — Production Build Pipeline

**Goal:** `pyra build` produces a complete production output: client bundles, server bundles, and a manifest. This is the first time Pyra generates deployable artifacts.

**Scope:** Implement the build orchestrator. Client build: generate a hydration entry wrapper for each page route (imports component + calls `hydrateRoot`), bundle with esbuild (browser target, code splitting, content hashing, CSS extraction), output to `dist/client/`. Server build: bundle each page route's SSR entry (exports component + load) and each API route handler (even though API routes aren't functional yet — just bundle them), output to `dist/server/`. Generate `dist/manifest.json` mapping each route to its client entry, shared chunks, CSS files, SSR entry, and metadata.

Implement the **build report** that prints after every build: a table showing each route, its type, render mode, JS size, CSS size, and whether it has a `load()` function. The data comes directly from the manifest and esbuild metafile.

**Does not include:** `pyra start`, prerendering, API route execution.

**Acceptance criteria:**
1. `pyra build` completes without errors and produces `dist/client/`, `dist/server/`, and `dist/manifest.json`.
2. `dist/manifest.json` is valid JSON that matches the `RouteManifest` type definition, and is human-readable (a developer can open it and understand the mapping).
3. Client bundles are content-hashed, code-split, and minified.
4. Server bundles are node-targeted and not minified (for debuggability).
5. The build report prints a per-route table showing accurate sizes.
6. Building a project with 5+ routes completes in under 3 seconds.

---

### v0.5 — Production Runtime (`pyra start`)

**Goal:** Deploy and run a Pyra app in production. `pyra build` then `pyra start` serves the app.

**Scope:** Implement the `pyra start` CLI command. At startup, read `dist/manifest.json`, build a route lookup table, resolve the adapter, and start an HTTP server. Implement the prod request pipeline: match URL against manifest routes, construct `RequestContext`, import the pre-built SSR entry from `dist/server/`, call `load()` if present, call `adapter.renderToHTML()`, inject the correct client entry and CSS from the manifest into the HTML, and respond. Serve static assets from `dist/client/` with appropriate cache headers (immutable for hashed files, no-cache for HTML).

Implement manifest-driven asset injection: each page's HTML includes only the `<script>` and `<link>` tags for the chunks it actually needs, as declared in the manifest. No more injecting everything.

**Does not include:** API routes in production, prerendering, middleware, tracing.

**Acceptance criteria:**
1. `pyra build && pyra start` serves a multi-page React app correctly.
2. Each page's HTML includes only the client chunks and CSS files it needs.
3. SSR works in production: server-rendered HTML hydrates on the client without errors.
4. Data loading works: `load()` runs on the server in production and data is available to the client.
5. Hashed static assets are served with `Cache-Control: public, max-age=31536000, immutable`.
6. `pyra start` boots in under 500ms (no compilation at startup).

---

### v0.6 — API Routes

**Goal:** API routes work end-to-end in dev and production. A Pyra app can serve both pages and JSON APIs from a single server.

**Scope:** In the dev server pipeline, when an API route matches, on-demand compile the `route.ts` file, import it, check which HTTP method was requested, call the corresponding exported handler, and return the `Response`. If the method isn't exported, return 405 Method Not Allowed.

In the build orchestrator, API route handlers are already being bundled (since v0.4). Now make the prod runtime import and execute them: match the API route, import the server entry from `dist/server/`, call the method handler.

Implement catch-all routes (`[...rest]`) in the router — this was deferred from v0.1 and is commonly needed for API auth callbacks.

**Does not include:** Middleware, layouts, prerendering, tracing.

**Acceptance criteria:**
1. `src/routes/api/users/route.ts` exporting `GET` and `POST` handles requests correctly in both dev and prod.
2. `src/routes/api/users/[id]/route.ts` receives `params.id` correctly.
3. Requesting an unimplemented method returns 405 with an `Allow` header listing available methods.
4. `RequestContext` response helpers work: `ctx.json({ ok: true })` returns proper JSON with correct Content-Type.
5. Catch-all route `[...path]/route.ts` matches nested paths and provides the full path in `params.path`.
6. A page route can call an API route during `load()` via `fetch('http://localhost:PORT/api/...')`.

---

### v0.7 — SSG & Prerendering

**Goal:** Page routes can opt into static generation. The build orchestrator prerenders pages to HTML files that are served directly in production without running SSR.

**Scope:** During `pyra build`, after generating the manifest, scan all page route SSR entries for a `prerender` export. For routes with `prerender: true` (no params), import the SSR entry, call `load()` if present, call `adapter.renderToHTML()`, inject client assets from the manifest, and write the full HTML to `dist/client/[path]/index.html`. For routes with `prerender: { paths() }` (dynamic params), call `paths()` to get the param sets, and prerender each one.

Update the prod runtime: when a request matches a prerendered route, serve the static HTML file directly from `dist/client/` without importing the SSR entry or calling `load()`.

Update the manifest to track `prerendered: true` and `prerenderedFile` for each prerendered route.

Add `CacheConfig` support: the route's `cache` export translates to `Cache-Control` headers set by the prod runtime.

**Does not include:** Middleware, layouts, incremental static regeneration.

**Acceptance criteria:**
1. `export const prerender = true` on a static page (e.g., `/about`) produces `dist/client/about/index.html` during build.
2. `export const prerender = { paths: () => slugs.map(s => ({ slug: s })) }` on `/blog/[slug]` prerenders all slugs.
3. Prerendered pages are served directly in production — no SSR entry import, no `load()` call. Verify by checking that removing the SSR entry doesn't break the prerendered route.
4. The build report shows "SSG" for prerendered routes and "SSG (N)" for dynamic prerendered routes.
5. `cache: { maxAge: 3600 }` sets `Cache-Control: public, max-age=3600` on the response.

---

### v0.8 — Middleware & Layouts

**Goal:** The request pipeline supports middleware stacking and layout nesting. These are the last major runtime features before the transparency layer.

**Scope:** Implement the middleware runner. On each request, after matching a route, collect the middleware chain: plugin middleware (if any), then file-based middleware from outermost to innermost (following the `middlewarePaths` on the matched `RouteNode`). Execute the chain using the `next()` continuation pattern. A middleware can short-circuit by returning a `Response` without calling `next()`.

Implement layout support. When the adapter's `renderToHTML()` is called, core passes the matched `layouts` array (from `RouteMatch`). The adapter is responsible for nesting the page component inside its layout components. For the React adapter, this means importing each layout module and composing them as parent components wrapping the page.

Implement route groups: the scanner strips parenthesized directory names from the URL pattern. `(marketing)/pricing/page.tsx` serves at `/pricing`.

**Does not include:** Request tracing, error boundaries, streaming.

**Acceptance criteria:**
1. A root `middleware.ts` runs before every request. A `dashboard/middleware.ts` runs only for `/dashboard/**` routes. They stack correctly (root runs first, then dashboard).
2. A middleware that checks for an auth cookie can redirect to `/login` by returning a `Response` without calling `next()`.
3. A root `layout.tsx` wraps all pages. A `blog/layout.tsx` wraps `/blog` and `/blog/[slug]` but not `/about`. Layouts nest (root layout wraps blog layout wraps page).
4. Route groups work: `(marketing)/pricing/page.tsx` serves at `/pricing`.
5. Middleware applies to both page routes and API routes in the same subtree.

---

### v0.9 — Transparency Layer

**Goal:** Request tracing and build reporting are fully operational. This is the differentiating feature — Pyra shows you exactly what's happening.

**Scope:** Implement the `RequestTracer`. At the start of each request in the dev server, create a tracer instance. Instrument each pipeline stage with `tracer.start(name)` / `tracer.end()` calls — this is approximately 15 lines added to the existing pipeline handler, not a new system. After the response is ready, finalize the trace and:

1. Set the `Server-Timing` response header (Chrome DevTools Network panel renders this natively as a timing waterfall).
2. Log a structured trace line to the terminal showing the route, status, total time, and per-stage breakdown.
3. Store the `RequestTrace` in the metrics system for the dev dashboard.

Implement the enhanced dev startup log: when the dev server starts, print the full route table showing all discovered routes, their types, and their middleware/layout chains.

Implement production trace support: controlled by `config.trace.production`. When set to `'header'`, trace only when the request includes `X-Pyra-Trace: 1`. When set to `'on'`, trace every request. Default is `'off'`.

Update the build report (already implemented in v0.4) with the final columns now that middleware, layouts, and SSG are implemented.

**Does not include:** Visual dev dashboard UI (the existing HTML dashboard is replaced by the structured trace system — a visual dashboard is a post-v1.0 feature).

**Acceptance criteria:**
1. Every dev request logs a trace to the terminal showing route match, middleware stages, load time, render time, and asset injection time.
2. Chrome DevTools Network panel shows `Server-Timing` entries for each pipeline stage on every dev request.
3. `pyra build` prints a complete per-route report with accurate sizes, render modes, middleware counts, and layout chains.
4. Production tracing works when enabled via `X-Pyra-Trace` header.
5. Tracing adds less than 1ms overhead per request (it's timestamp collection, not profiling).

---

### v1.0 — Production Hardening

**Goal:** Pyra is stable, handles errors gracefully, and ships with a reference application that demonstrates all features. This is the release people can actually use.

**Scope:** Implement error handling throughout the pipeline: if `load()` throws, render the nearest `error.tsx` boundary (or a default error page). If the adapter's `renderToHTML()` throws, catch and render an error page with the stack trace in dev (sanitized in prod). If an API handler throws, return a 500 response with the error in dev (generic message in prod). If a middleware throws, propagate to the error boundary.

Implement 404 handling: when no route matches, render a custom `src/routes/404.tsx` if it exists, or a default 404 page.

Implement graceful shutdown for `pyra start`: handle SIGTERM/SIGINT, finish in-flight requests, then exit.

Build the **Pyra Blog** reference application — a complete full-stack app demonstrating:
- Page routes with SSR (home, dashboard)
- Dynamic routes with data loading (blog posts)
- SSG/prerendered pages (about, individual blog posts)
- API routes (CRUD for posts)
- Middleware (auth for dashboard)
- Layouts (root layout, blog layout, dashboard layout)
- The build report and request tracing in action

Write the `pyra create` template for the new full-stack app (replacing the current static-only templates).

Ship `pyra init` with a `--full-stack` flag (or make it the default) that scaffolds a project with `src/routes/`, a root layout, a home page, and an API health check route.

**Does not include:** Streaming SSR, React Fast Refresh HMR, additional adapters, visual dev dashboard, edge/serverless targets.

**Acceptance criteria:**
1. Errors in `load()`, `renderToHTML()`, API handlers, and middleware are caught and displayed as readable error pages in dev, and as safe generic errors in prod.
2. A custom `src/routes/404.tsx` renders for unmatched URLs.
3. The Pyra Blog reference app works end-to-end: `pyra dev` for development, `pyra build` producing the complete dist/ output, `pyra start` serving the production app.
4. `pyra create my-app` scaffolds a working full-stack project that runs with `pyra dev` out of the box.
5. All TypeScript interfaces (`PyraAdapter`, `RouteModule`, `RouteGraph`, `RouteManifest`, `RequestContext`, `RequestTrace`) are stable and documented.
6. The adapter boundary is clean: `pyrajs-core` has zero React imports and functions correctly with only the adapter contract.

---

## Post-v1.0: Multi-Framework Validation

The first post-v1.0 milestone is `pyrajs-adapter-svelte`. If the Svelte adapter works without modifying core, the framework-agnostic architecture is validated. Build two identical demo apps (React and Svelte) with the same route structure and verify they produce the same manifest shape and request behavior. If core needs changes, they're interface refinements — not React-specific hacks being generalized.

Following Svelte, Vue and Solid adapters can be built by the community against the stable adapter contract. Pyra's role shifts from "build everything" to "maintain the core kernel and let the ecosystem build adapters."

Other post-v1.0 features: streaming SSR (`renderToStream()` on the adapter interface), React Fast Refresh HMR, visual dev dashboard, edge/serverless deployment targets, incremental static regeneration.

---

## Design Tradeoffs

**Web standard Request/Response internally.** The pipeline works with the Web `Request` and `Response` objects even though the underlying server is Node's `http.Server`. This costs a thin conversion layer (Node `IncomingMessage` → `Request`, `Response` → Node `ServerResponse`) but buys portability: when we add edge/serverless targets, the pipeline doesn't change. Node 18+ has native `fetch`/`Request`/`Response` support via `undici`, so this is not a polyfill concern.

**On-demand compilation in dev, not upfront.** The dev server compiles route modules when they're first requested, not at startup. This keeps startup instant regardless of project size. The tradeoff is that the first request to each route is slower (needs compilation), but subsequent requests hit the cache.

**Layouts are adapter-rendered, not core-rendered.** Core tells the adapter which layout chain applies to a matched route. The adapter is responsible for nesting the page inside its layouts during `renderToHTML()`. This keeps core out of the business of composing framework-specific component trees. The tradeoff is that each adapter must understand layout nesting, but this is a natural fit — React uses JSX composition, Svelte uses `<slot/>`, Vue uses `<router-view/>`.

**No streaming SSR in v1.0.** Streaming (`renderToPipeableStream` in React) is deferred. The `renderToHTML()` contract returns a string, not a stream. Streaming adds complexity in the pipeline (headers must be sent before the body is complete, error boundaries work differently, asset injection timing changes). For v1.0, the priority is proving the architecture is correct. Streaming can be added later by adding a `renderToStream()` method to the adapter interface.

**Tracing is always-on in dev, opt-in in prod.** In dev, every request is traced because the overhead is negligible and the DX value is high. In production, tracing is off by default because even small overhead matters at scale. The `trace.production` config and `X-Pyra-Trace` header allow enabling it when needed for debugging production issues.

**Plugin middleware vs file middleware.** Two middleware mechanisms exist intentionally. File-based `middleware.ts` is scoped to a route subtree and is the primary user-facing feature. Plugin middleware is global and runs before file middleware — it's for cross-cutting infrastructure (logging, request ID injection, CORS). The ordering is always: plugin middleware first, then file middleware from outermost to innermost. No ambiguity.

**Single adapter per project in v1.0.** A project configures one adapter. Multi-adapter support (React for some routes, Svelte for others) is architecturally possible but not implemented — it adds significant complexity to the build orchestrator. The architecture doesn't preclude it; it's just not worth building until single-adapter usage is rock solid.

**React-first, not React-only.** The type system defines a generic `PyraAdapter` interface from day one. The router accepts any file extensions. The core never imports React. But only one adapter ships through v1.0. This is the right tradeoff between architectural ambition and execution focus.
