# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pyra.js is a full-stack web framework built as a TypeScript monorepo using pnpm workspaces. It provides file-based routing with SSR (server-side rendering), an HMR dev server, esbuild-based production builds, request tracing, and a CLI with project scaffolding. The architecture is React-first through v1.0, with a framework-agnostic adapter interface (`PyraAdapter`) to support other UI frameworks post-v1.0.

## Monorepo Structure

Four packages with strict build order: **shared → core → adapter-react → cli**

- **packages/shared** (`pyrajs-shared`) — Types (`types.ts`), config loader (`config-loader.ts`), logger (`logger.ts`), network utilities (`net-utils.ts`)
- **packages/core** (`pyrajs-core`) — Dev server with HMR, production server, esbuild bundler with caching, file-based route scanner, trie-based router, middleware runner, request context, request tracer, metrics collection, build orchestrator
- **packages/adapter-react** (`pyrajs-adapter-react`) — React SSR adapter implementing `PyraAdapter` interface. Uses `renderToString()` for server rendering and `hydrateRoot()` for client hydration. Supports layout wrapping.
- **packages/cli** (`pyrajs-cli`) — CLI commands (`bin.ts` entry point), project scaffolding (`scaffold.ts`, `init.ts`), package manager detection (`pm.ts`), dependency graph visualization (`graph/`), project diagnostics (`commands/doctor.ts`), dev/prod banners, keyboard shortcuts, templates

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages (respects shared → core → adapter-react → cli order)
pnpm build

# Link CLI globally for testing
pnpm dev:link

# Remove global CLI link
pnpm dev:unlink

# Type checking (uses project references via tsc -b)
pnpm typecheck

# Type check individual packages (no root tsconfig.json exists)
cd packages/shared && npx tsc --noEmit
cd packages/core && npx tsc --noEmit
cd packages/cli && npx tsc --noEmit

# Clean build artifacts
pnpm clean

# Watch mode for core package during development
cd packages/core && pnpm dev

# Run CLI in development without building
cd packages/cli && pnpm dev:run
```

Individual packages are built with `tsup`. Each package can be built independently with `pnpm build` from its directory. The CLI build also runs `scripts/copy-templates.mjs` to copy template files to dist.

There are no tests configured yet — `pnpm test` is not implemented.

## CLI Commands

The CLI entry point is `packages/cli/src/bin.ts`. Main commands:

- `pyra dev` — Start dev server with HMR (HTTP + WebSocket). Options: `--port`, `--open`, `--config`, `--mode`, `--verbose`
- `pyra build` — Production build via esbuild. Options: `--out-dir`, `--minify`, `--sourcemap`, `--config`, `--mode`, `--silent`
- `pyra start` — Start production server (requires `pyra build` first). Options: `--port`, `--config`, `--dist`, `--silent`
- `pyra create [name]` — Quick minimal project setup. Options: `--pm`, `--skip-install`, `--silent`
- `pyra init [name]` — Interactive scaffolding with template/language/Tailwind selection. Options: `--template`, `--language`, `--pm`, `--tailwind`, `--ui`, `--skip-install`, `--silent`
- `pyra graph [path]` — Dependency graph visualization. Formats: html/svg/png/mermaid/dot/json. Options: `--format`, `--outfile`, `--open`, `--internal-only`, `--external-only`, `--filter`, `--hide-dev`, `--hide-peer`, `--cycles`, `--stats`, `--json`
- `pyra doctor` — Diagnose project setup (detects SSR vs SPA mode, validates config, scans routes). Options: `--config`, `--silent`

## Configuration System

Config loader is in `packages/shared/src/config-loader.ts`. Auto-discovers files in order: `pyra.config.ts` → `.js` → `.mjs` → `.cjs` → `.pyrarc.ts` → `.pyrarc.js` → `.pyrarc.mjs`. Supports static objects, mode-aware functions (`defineConfigFn`), and async configs. Priority: defaults < config file < CLI flags.

Key config fields: `root`, `entry`, `routesDir` (default `src/routes`), `server` (DevServerConfig), `build` (BuildConfig), `resolve`, `env`, `plugins`, `adapter`, `trace` (`{ production: 'off' | 'header' | 'on', bufferSize }`) , `buildReport` (`{ warnSize }`).

## Key Architecture Details

### Routing & SSR Pipeline

- **Scanner** (`core/src/scanner.ts`): Recursively walks `src/routes/` discovering `page.tsx` (pages), `route.ts` (APIs), `layout.tsx` (layouts), `middleware.ts` (middleware). Supports route groups `(name)`, dynamic segments `[slug]`, catch-all `[...path]`. Validates no route collisions and resolves layout/middleware ancestry.
- **Router** (`core/src/router.ts`): Trie-based URL matching with priority: static > dynamic > catch-all. Built from `ScanResult` via `createRouter()`. Matches return `RouteMatch` with route, params, and layout chain.
- **Middleware** (`core/src/middleware.ts`): `runMiddleware()` executes a chain of `Middleware` functions with `next()` pattern. Short-circuits if middleware returns a Response without calling `next()`.
- **Request Context** (`core/src/request-context.ts`): Builds `RequestContext` from Node's `IncomingMessage`. Includes Web standard `Request`, `URL`, params, `CookieJar`, env vars (filtered by `PYRA_` prefix), and response helpers (`json()`, `html()`, `redirect()`, `text()`).

### Servers

- **DevServer** (`core/src/dev-server.ts`): HTTP server with WebSocket HMR. Serves static files, injects HMR client at `/__pyra_hmr_client`, dashboard UI at `/_pyra`. Pipeline: route match → compile → load → render → inject assets. Prints route table at startup. Trace API endpoints at `/_pyra/api/traces`, `/_pyra/api/traces/stats`, `/_pyra/api/traces/:id`. CSS endpoint at `/__pyra/styles/*` — serves CSS extracted from bundled client modules as proper `text/css` (avoids FOUC). During SSR assembly, `handlePageRouteInner` eagerly calls `bundleFile()` for each layout + page to populate `cssOutputCache`, then injects `<link rel="stylesheet" href="/__pyra/styles/...">` tags into `<!--pyra-head-->`.
- **ProdServer** (`core/src/prod-server.ts`): Serves prebuilt assets from `dist/`. Conditional request tracing via `shouldTrace()` (controlled by `trace.production` config). Server-Timing headers on traced responses.

### Build System

- **Bundler** (`core/src/bundler.ts`): Wraps esbuild with an in-memory cache (5-second TTL). Maintains a separate `cssOutputCache` — CSS extracted from browser-platform builds is stored here (keyed by file path) and exposed via `getCSSOutput(filePath)` rather than injected into JS (which caused FOUC). `clearBundleCache()` and `invalidateDependentCache()` clear both caches on file changes.
- **Build Orchestrator** (`core/src/build.ts`): Production build producing `dist/client/` + `dist/server/` + `dist/manifest.json`. Enhanced build report with middleware/layout columns, shared chunks section, gzip size estimation, and size warnings.

### Transparency Layer (v0.9)

- **RequestTracer** (`core/src/tracer.ts`): Per-request timing via `performance.now()`. `start()`/`end()` pairs for pipeline stages. Produces `Server-Timing` headers (W3C format for Chrome DevTools), tree-style terminal logs with bottleneck highlighting (yellow >50%, red >80%), and `RequestTrace` objects.
- **MetricsStore** (`core/src/metrics.ts`): Singleton collecting build metrics (last 50), HMR events (last 100), dependency graph data, and request traces (ring buffer, default 200). `routeStats()` computes avg/p50/p95/p99 response times per route.

### React Adapter

- **Adapter** (`adapter-react/src/adapter.ts`): Implements `PyraAdapter` interface. `renderToHTML()` uses `createElement` + `renderToString()` with layout wrapping. `getHydrationScript()` generates client-side `hydrateRoot()` code with layout imports. `getDocumentShell()` returns HTML template with `<!--pyra-head-->` and `<!--pyra-outlet-->` markers.

### CLI Utilities

- **Package Manager Detection** (`cli/src/pm.ts`): Detects npm/pnpm/yarn/bun via lockfile presence → `npm_config_user_agent` → PATH availability → user prompt.
- **Graph System** (`cli/src/graph/`): `buildGraph.ts` analyzes package.json files and lockfiles. Serializers in `graph/serialize/` output dot, html, json, and mermaid formats. Supports workspace detection, cycle detection, and filtering.
- **Templates** (`cli/templates/`): vanilla-ts, vanilla-js, react-ts-fullstack, react-js-fullstack. Scaffolding replaces `{{PROJECT_NAME}}` placeholders. Full-stack templates have `style.css` co-located in `src/routes/` and imported via `import './style.css'` in `layout.tsx` — the CSS pipeline serves it via `/__pyra/styles/*`.
- **Reporter** (`cli/src/utils/reporter.ts`): `withBanner()` wraps command execution with timing and banner display. Respects `--silent` flag and `PYRA_SILENT` env var.
- **Keyboard Shortcuts** (`cli/src/utils/keyboard.ts`): TTY keyboard shortcuts for dev/prod servers (restart, quit, open browser, clear).
- **Dev Banner** (`cli/src/utils/dev-banner.ts`): Styled startup banners for dev and production servers with capability detection (Unicode, color, CI).
- **Doctor** (`cli/src/commands/doctor.ts`): Project diagnostics — detects project mode (Static SPA vs Full-Stack SSR vs Misconfigured), validates config, scans routes, reports setup issues.

## Type System

Core types are in `packages/shared/src/types.ts`. Key types:

- `PyraConfig` — Full config object with server, build, resolve, env, plugins, adapter, trace, buildReport fields
- `PyraAdapter` — Framework adapter interface (name, fileExtensions, esbuildPlugins, renderToHTML, getHydrationScript, getDocumentShell)
- `RouteNode` — Route definition (id, pattern, filePath, type, params, catchAll, layoutId, middlewarePaths, children)
- `RouteGraph` — Router interface (nodes, match, get, pageRoutes, apiRoutes, toJSON)
- `RequestContext` — Per-request context (request, url, params, headers, cookies, env, mode, routeId, json/html/redirect/text helpers)
- `Middleware` — Middleware function signature: `(context, next) => Response | Promise<Response>`
- `RequestTrace` / `TraceStage` — Request tracing data structures
- `RouteManifest` / `ManifestRouteEntry` — Build manifest types
- `defineConfig()` / `defineConfigFn()` — Config helper functions

## Documentation

- `docs/ARCHITECTURE.md` — Full platform design and milestone roadmap (v0.1 through v1.0)
- `docs/CONFIG_SYSTEM.md` — Configuration system documentation
- `docs/SSR.md` — SSR implementation details
- `docs/image-optimization.mdx` — Image optimization plugin guide (`pyraImages()`, `<Image>` component)
- `docs/tutorial-todo-app.md` — Beginner-friendly full-stack todo app tutorial

## Tech Stack

- TypeScript (ES2020, strict mode, bundler module resolution)
- tsup for package builds
- esbuild for production bundling
- Commander.js for CLI
- @inquirer/prompts for interactive CLI prompts
- chokidar for file watching
- ws for WebSocket HMR
- picocolors for terminal output
- React 18/19 (peer dependency of adapter-react)
- Node.js >=18.0.0, ESM output format
- pnpm 10.x as package manager
