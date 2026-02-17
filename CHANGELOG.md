# Changelog

All notable changes to Pyra.js are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.12.1] - 2025-02-16

### Added
- Install dependencies prompt in `create-pyra` wizard, users are now asked whether to install instead of auto-installing
- TTY detection in `create-pyra` - shows a clear error with alternative commands when stdin is not a TTY (fixes crash on Windows when running via `npm create`)

### Fixed
- `create-pyra` no longer crashes with `EBADF` when launched through `npm create` on Windows/Git Bash


## [0.9.5] - 2025-02-16

### Changed
- Replaced `@inquirer/prompts` with `@clack/prompts` in `create-pyra` for a cleaner interactive wizard experience
- Updated architecture documentation

### Added
- `theme.ts` in `create-pyra` — color palette constants and styled progress indicators
- `tree.ts` in `create-pyra` — file tree formatter for post-scaffold output

### Fixed
- Corrected prompt flow issue after migrating to clack

## [0.9.4] - 2025

### Added

- Render mode system (`ssr`, `spa`, `ssg`) configurable globally or per-route
- `render-mode.ts` in core — resolves per-route render mode from exports vs global config
- Render mode branching in build pipeline with SPA fallback support
- Render mode branching in production server
- Rendering mode prompt in `create-pyra` wizard
- Preact framework support — `preact-ts`, `preact-js`, `preact-spa-ts`, `preact-spa-js` templates
- Project templates for `create-pyra`: `react-ts`, `react-js`, `vanilla-ts`, `vanilla-js`

### Changed
- Updated `
create-pyra` templates to account for SSR/SPA/SSG rendering modes
- Updated types to include new rendering engine types
- Refactored `pyra init` command and scaffold system
- Exported `renderMode` via config loading

### Fixed

- Corrected `replaceAll` error inside `create-pyra`

## [0.9.3] - 2025

### Added

- Comprehensive documentation: middleware, SSR, layouts, API routes, CLI, adapters, request tracing
- `create-pyra` readme

### Changed

- Updated package versioning across all packages (`pyrajs-cli` 0.10.1, `create-pyra` 0.11.0)

## [0.9.2] - 2025

### Added

- `create-pyra` standalone package — interactive project scaffolding via `npm create pyra`
- GitHub Actions CI workflows
- Publish script for package releases
- Base `tsconfig.json` at project root with project references
- Pyra logo and brand colors in `create-pyra` wizard
- Example projects in `examples/` folder

### Fixed

- Rebuilt types to align with new root tsconfig
- npm strict publish issue resolved via bin wrapper

## [0.9.1] - 2025

### Added

- Error boundary types (`ErrorPageProps`, `ErrorModule`)
- `error.tsx` and `404.tsx` route file conventions
- Error handling in dev server — renders nearest error boundary with full stack traces
- Error handling in build pipeline — 404 entries included in production builds
- Error handling in prod server — generic error pages (no stack traces in production)
- Route collision detection in scanner
- Graceful shutdown with `inflightCount` tracking and 10-second drain timeout

### Changed
- Improved terminal styling — Pyra text in red via chalk, cleaner default action display
- Dynamic versioning for CLI template dependencies

### Fixed
- Templates now use dynamic versioning for `pyrajs-cli` version references

## [0.9.0] - 2025

### Added

- `RequestTracer` class — per-request timing via `performance.now()` with `start()`/`end()` stage pairs
- `MetricsStore` singleton — ring buffer for traces (200), build metrics (50), HMR events (100)
- `Server-Timing` header output (W3C format for Chrome DevTools)
- Tree-style terminal trace logs with bottleneck highlighting (yellow >50%, red >80%)
- Request tracing in dev server pipeline
- Conditional request tracing in production server (`trace.production`: `'off'` | `'header'` | `'on'`)
- Gzip size estimates in build manifest
- `routeStats()` — per-route avg/p50/p95/p99 response time aggregation
- Trace API endpoints: `/_pyra/api/traces`, `/_pyra/api/traces/stats`, `/_pyra/api/traces/:id`
- `contributing.md`

## [0.8.0] - 2025

### Added

- Production server banner with timing and capability display
- Middleware and layout support in SSR pipeline — layouts nest outermost-to-innermost
- Middleware runner with `next()` continuation pattern

### Changed
- Updated `pyra start` command to display production banner

## [0.7.0] - 2025

### Added

- Prerendering and SSG support in build pipeline
- `CacheConfig` and `PrerenderConfig` types
- Prerendered pages served as static files from production server
- Dynamic route handling in production server
- SSG tests for prerendering

## [0.6.0] - 2025

### Added

- API route handlers in dev server (`route.ts` with HTTP method exports)
- API route handlers in production server
- Catch-all route segments (`[...path]`) in router trie
- `catchAll` parameter in route scanner
- Route ID to URL conversion utility

### Fixed
- Router mismatch error in dev server

## [0.5.0] - 2025

### Added

- `pyra doctor` command — project diagnostics (SSR vs SPA mode detection, config validation, route scanning)
- Dev server keyboard shortcuts (`r` restart, `o` open browser, `c` clear, `q` quit, `h` help)
- Dev banner — Vite-inspired startup display with route counts, SSR status, URLs
- `net-utils.ts` — port finding, URL resolution, config helpers
- Reporter utility with `withBanner()` wrapper and silent mode support
- Auto port detection — finds next available port if configured port is in use
- Terminal art for `pyra` default command

### Fixed

- Double help output in terminal

### Changed

- Dev server returns structured `DevResult` type

## [0.4.0] - 2025

### Added

- Build orchestrator producing `dist/client/` + `dist/server/` + `dist/manifest.json`
- Production server (`pyra start`) serving prebuilt assets from `dist/`
- `pyra start` CLI command for production preview
- `RouteManifest` and `ManifestRouteEntry` types

### Changed

- Refactored build pipeline with client/server split

## [0.3.0] - 2025

### Added

- File-system route scanner (`scanner.ts`) — discovers `page.tsx`, `route.ts`, `layout.tsx`, `middleware.ts`
- Trie-based URL router (`router.ts`) with priority: static > dynamic > catch-all
- React SSR adapter (`pyrajs-adapter-react`) implementing `PyraAdapter` interface
- `RequestContext` — Web standard `Request`, `CookieJar`, env vars, response helpers
- Route-aware SSR in dev server via adapter pattern
- `PyraAdapter` interface for framework-agnostic rendering
- Route groups `(name)`, dynamic segments `[slug]` support
- Server-side `load()` function support for data fetching
- On-demand compilation via esbuild for route modules

## [0.2.0] - 2025

### Added

- Dependency graph visualization (`pyra graph`) — HTML, SVG, PNG, mermaid, dot, JSON formats
- Performance banners in `init` and `create` commands

### Fixed

- Graph rendering issue
- CSS bundling issue
- Link error in local dev

## [0.1.0] - 2025

### Added

- Monorepo setup with pnpm workspaces (shared, core, cli packages)
- `pyra dev` — development server with HMR via WebSocket
- `pyra build` — production build via esbuild
- `pyra init` — project scaffolding with template selection
- Config loader — auto-discovers `pyra.config.ts` / `.js` / `.mjs` / `.cjs` / `.pyrarc.*`
- Package manager detection (npm, pnpm, yarn, bun)
- Project templates for scaffolding
- Colored terminal output via picocolors
