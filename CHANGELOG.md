# Changelog

All notable changes to Pyra.js are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.15.2] - 2026-02-19

### Added
- Image optimization plugin (`pyraImages()`) - framework-agnostic, lives entirely in `packages/core`
  - Activate via `plugins: [pyraImages()]` in `pyra.config.ts`
  - `sharp` is an optional peer dependency - if not installed, a warning is printed and the endpoint returns 501 with install instructions
  - Dev server: on-demand `/_pyra/image?src=&w=&format=&q=` endpoint with 60-second in-memory cache
  - Production build: variants pre-generated at build time into `dist/client/_images/` with content-hashed filenames
  - Manifest: `images` key maps source paths to `ImageManifestEntry` with all variant metadata
  - Prod server: `/_pyra/image` reads manifest and serves pre-built files with `immutable` cache headers
  - Config options: `formats` (default `['webp']`), `sizes` (default `[640, 1280, 1920]`), `quality` (default `80`), `cacheDir`
  - Plugin hooks `buildStart` and `buildEnd` are now wired in `build.ts` (previously defined but never called)
- React `<Image>` component (`packages/adapter-react`) — pure URL builder, no processing logic
  - Renders `<picture>` with `<source>` per format (avif first for best compression, then webp) and `<img>` as fallback
  - Supports `widths`, `formats`, `quality`, `sizes`, `loading`, `className`, `style` props
- `public/` directory handling — static assets now served transparently at the root URL (like Vite)
  - Dev server: `resolvePublicFilePath()` checks `public/` before route matching; files served with `Cache-Control: public, max-age=3600`
  - File reads use `Buffer` (binary-safe) — fixes potential corruption of images and fonts in SPA static fallback
  - Production build: `public/` contents copied to `dist/client/` at the end of the build
- SPA rendering mode option in `pyra init` wizard — after selecting React, users are now asked whether the project is Full-stack (SSR) or Frontend (SPA)
  - Full-stack → `react-ts-fullstack` / `react-js-fullstack` template (file-based routing, server required)
  - SPA → `react-ts-spa` / `react-js-spa` template (`entry:` config, no server required)
- New CLI templates: `react-ts-spa` and `react-js-spa`
  - `pyra.config` with `entry:` pointing to `src/main.tsx` / `src/main.jsx`
  - `src/App.tsx` / `src/App.jsx` with minimal starter component
  - `public/favicon.svg` included
- `public/favicon.svg` added to all CLI templates (`vanilla-ts`, `vanilla-js`, `react-ts-fullstack`, `react-js-fullstack`, `react-ts-spa`, `react-js-spa`)
- `public/favicon.svg` added to all `create-pyra` templates (`vanilla-ts`, `vanilla-js`, `react-ts`, `react-js`, `react-spa-ts`, `react-spa-js`, `preact-ts`, `preact-js`, `preact-spa-ts`, `preact-spa-js`)
- Favicon `<link>` tag added to `index.html` in all SPA/vanilla templates (both `packages/cli` and `packages/create-pyra`)
- Favicon `<link>` tag added to `DEFAULT_SHELL` in `packages/adapter-react` — full-stack (SSR) projects now include the favicon in the generated HTML shell

### Changed
- `PyraPlugin.buildEnd` signature updated: now receives `{ manifest, outDir, root }` context object instead of no arguments

## [0.13.4] - 2026-02-18

### Added
- SPA production build pipeline - `pyra build` now produces static output for entry-based projects
  - Detected when `config.entry` is a string (e.g. `entry: 'src/main.tsx'`) with no file-based routing
  - `index.html` transformed at build time: dev-time `<script type="module" src="...">` tags removed, hashed script and CSS injected
  - `public/` directory copied to `dist/` if present
  - Build report shows per-file sizes with gzip estimate - same style as SSR report
  - SSR/SSG build path is completely unchanged - SPA detection is an early return before any route scanning

### Changed
- `spawnPM()` in `create-pyra` now uses `cmd.exe /c <pm> install` on Windows instead of `shell: true` with `.cmd` extension - fixes dependency installation failing silently after the DEP0190 fix in 0.13.0

### Fixed
- Node.js DEP0190 deprecation warning (`Passing args to a child process with shell option true`) no longer appears when running `create-pyra`
  - `commandExists()` changed to `shell: false` - `where.exe` / `which` are real executables
  - `spawnPM()` changed to `shell: false` with `cmd.exe /c` on Windows, plain spawn on Unix

### Refactored
- `packages/core/src/build.ts` split into focused modules
  - `build.ts` - SSR/SSG orchestrator only
  - `buildSPA.ts` - SPA static build (self-contained with its own helpers)
  - `types.ts` - `BuildOrchestratorOptions` and `BuildResult` interfaces (re-exported from `index.ts`)

## [0.13.0] - 2026-02-18

### Added
- PostCSS integration in core - Tailwind CSS now works in both dev and production builds
  - `css-plugin.ts` - esbuild plugin that loads PostCSS dynamically from the user's project (no new dependency in `pyrajs-core`)
  - PostCSS config auto-detected (`postcss.config.js` / `.cjs` / `.mjs`) with support for both object and array plugin formats
  - CSS through esbuild bundler (imported from JS modules) processed via `createPostCSSPlugin()`
  - CSS served directly as static files in dev server processed via `runPostCSS()`
  - PostCSS config cached per project root to avoid re-loading on every request
- `dev:link` and `dev:unlink` scripts to `create-pyra/package.json` for easy local testing.

- CLI templates directory (`packages/cli/templates/`) with all four template variants:
  - `react-ts-fullstack/` - TypeScript fullstack SSR template with layout, page, about page, health API route
  - `react-js-fullstack/` - JavaScript fullstack SSR template (same structure, no TypeScript)
  - `vanilla-ts/` - Minimal vanilla TypeScript SPA template
  - `vanilla-js/` - Minimal vanilla JavaScript SPA template

### Changed
- Tailwind prompt in `create-pyra` wizard simplified from a 3-option select (none / basic / shadcn) to a yes/no confirm
  - Removed shadcn preset - shadcn setup requires manual steps beyond CSS config
  - Removed `TailwindPreset` type and `generateShadcnTailwindConfig()` helper
  - Summary row now shows "Yes" / "No" instead of preset name

### Fixed
- `dev:link` in `create-pyra` now uses `npm link` instead of `pnpm link --global` - avoids `ERR_PNPM_NO_GLOBAL_BIN_DIR` error when pnpm global bin dir is not configured

## [0.12.2] - 2026-02-16

### Changed
- Updated all template CSS to use Pyra brand colors (`#e63946` / `#f4845f`) - replaces old purple/blue and cyan/blue gradients
- Added polished CSS to all fullstack SSR templates (nav bar, hero section, feature cards, footer)

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
- `theme.ts` in `create-pyra` - color palette constants and styled progress indicators
- `tree.ts` in `create-pyra` - file tree formatter for post-scaffold output

### Fixed
- Corrected prompt flow issue after migrating to clack

## [0.9.4] - 2025

### Added

- Render mode system (`ssr`, `spa`, `ssg`) configurable globally or per-route
- `render-mode.ts` in core - resolves per-route render mode from exports vs global config
- Render mode branching in build pipeline with SPA fallback support
- Render mode branching in production server
- Rendering mode prompt in `create-pyra` wizard
- Preact framework support - `preact-ts`, `preact-js`, `preact-spa-ts`, `preact-spa-js` templates
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

- `create-pyra` standalone package - interactive project scaffolding via `npm create pyra`
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
- Error handling in dev server - renders nearest error boundary with full stack traces
- Error handling in build pipeline - 404 entries included in production builds
- Error handling in prod server - generic error pages (no stack traces in production)
- Route collision detection in scanner
- Graceful shutdown with `inflightCount` tracking and 10-second drain timeout

### Changed
- Improved terminal styling - Pyra text in red via chalk, cleaner default action display
- Dynamic versioning for CLI template dependencies

### Fixed
- Templates now use dynamic versioning for `pyrajs-cli` version references

## [0.9.0] - 2025

### Added

- `RequestTracer` class - per-request timing via `performance.now()` with `start()`/`end()` stage pairs
- `MetricsStore` singleton - ring buffer for traces (200), build metrics (50), HMR events (100)
- `Server-Timing` header output (W3C format for Chrome DevTools)
- Tree-style terminal trace logs with bottleneck highlighting (yellow >50%, red >80%)
- Request tracing in dev server pipeline
- Conditional request tracing in production server (`trace.production`: `'off'` | `'header'` | `'on'`)
- Gzip size estimates in build manifest
- `routeStats()` - per-route avg/p50/p95/p99 response time aggregation
- Trace API endpoints: `/_pyra/api/traces`, `/_pyra/api/traces/stats`, `/_pyra/api/traces/:id`
- `contributing.md`

## [0.8.0] - 2025

### Added

- Production server banner with timing and capability display
- Middleware and layout support in SSR pipeline - layouts nest outermost-to-innermost
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

- `pyra doctor` command - project diagnostics (SSR vs SPA mode detection, config validation, route scanning)
- Dev server keyboard shortcuts (`r` restart, `o` open browser, `c` clear, `q` quit, `h` help)
- Dev banner - Vite-inspired startup display with route counts, SSR status, URLs
- `net-utils.ts` - port finding, URL resolution, config helpers
- Reporter utility with `withBanner()` wrapper and silent mode support
- Auto port detection - finds next available port if configured port is in use
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

- File-system route scanner (`scanner.ts`) - discovers `page.tsx`, `route.ts`, `layout.tsx`, `middleware.ts`
- Trie-based URL router (`router.ts`) with priority: static > dynamic > catch-all
- React SSR adapter (`pyrajs-adapter-react`) implementing `PyraAdapter` interface
- `RequestContext` - Web standard `Request`, `CookieJar`, env vars, response helpers
- Route-aware SSR in dev server via adapter pattern
- `PyraAdapter` interface for framework-agnostic rendering
- Route groups `(name)`, dynamic segments `[slug]` support
- Server-side `load()` function support for data fetching
- On-demand compilation via esbuild for route modules

## [0.2.0] - 2025

### Added

- Dependency graph visualization (`pyra graph`) - HTML, SVG, PNG, mermaid, dot, JSON formats
- Performance banners in `init` and `create` commands

### Fixed

- Graph rendering issue
- CSS bundling issue
- Link error in local dev

## [0.1.0] - 2025

### Added

- Monorepo setup with pnpm workspaces (shared, core, cli packages)
- `pyra dev` - development server with HMR via WebSocket
- `pyra build` - production build via esbuild
- `pyra init` - project scaffolding with template selection
- Config loader - auto-discovers `pyra.config.ts` / `.js` / `.mjs` / `.cjs` / `.pyrarc.*`
- Package manager detection (npm, pnpm, yarn, bun)
- Project templates for scaffolding
- Colored terminal output via picocolors
