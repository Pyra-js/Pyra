# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pyra.js is a modern frontend build tool and bundler built as a TypeScript monorepo using pnpm workspaces. It wraps esbuild for production builds and provides an HMR dev server via HTTP + WebSocket. The CLI is built with Commander.js.

## Monorepo Structure

Three packages with strict build order: **shared → core → cli**

- **packages/shared** (`pyrajs-shared`) — Types (`types.ts`), config loader (`config-loader.ts`), logger
- **packages/core** (`pyrajs-core`) — Dev server with HMR, esbuild-based bundler with caching, production build, metrics collection
- **packages/cli** (`pyrajs-cli`) — CLI commands (`bin.ts` entry point), project scaffolding (`scaffold.ts`, `init.ts`), package manager detection (`pm.ts`), dependency graph visualization (`graph/`), templates

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages (respects shared → core → cli order)
pnpm build

# Link CLI globally for testing
pnpm dev:link

# Remove global CLI link
pnpm dev:unlink

# Type checking
pnpm typecheck

# Clean build artifacts
pnpm clean

# Watch mode for core package during development
cd packages/core && pnpm dev
```

Individual packages are built with `tsup`. Each package can be built independently with `pnpm build` from its directory.

There are no tests configured yet — `pnpm test` is not implemented.

## CLI Commands

The CLI entry point is `packages/cli/src/bin.ts`. Main commands:

- `pyra dev` — Start dev server with HMR (HTTP + WebSocket)
- `pyra build` — Production build via esbuild
- `pyra create [name]` — Quick minimal project setup
- `pyra init [name]` — Interactive scaffolding with template/language/Tailwind selection
- `pyra graph [path]` — Dependency graph visualization (html/svg/png/mermaid/dot/json)

## Configuration System

Config loader is in `packages/shared/src/config-loader.ts`. Auto-discovers files in order: `pyra.config.ts` → `.js` → `.mjs` → `.cjs` → `.pyrarc.ts` → `.pyrarc.js` → `.pyrarc.mjs`. Supports static objects, mode-aware functions (`defineConfigFn`), and async configs. Priority: defaults < config file < CLI flags.

## Key Architecture Details

- **DevServer** (`core/src/dev-server.ts`): HTTP server serves static files and injects HMR client script at `/__pyra_hmr_client`. Dashboard UI at `/_pyra`. WebSocket broadcasts file change events via chokidar watcher.
- **Bundler** (`core/src/bundler.ts`): Wraps esbuild with an in-memory cache (5-second TTL). `invalidateDependentCache()` handles cache busting on file changes.
- **Metrics** (`core/src/metrics.ts`): Singleton store tracking compile times, HMR events, build history (last 50), and dependency graph data. Powers the dashboard API.
- **Package Manager Detection** (`cli/src/pm.ts`): Detects npm/pnpm/yarn/bun via lockfile presence → `npm_config_user_agent` → PATH availability → user prompt.
- **Graph System** (`cli/src/graph/`): `buildGraph.ts` analyzes package.json files and lockfiles. Serializers in `graph/serialize/` output dot, html, json, and mermaid formats. Supports workspace detection, cycle detection, and filtering.
- **Templates** (`cli/templates/`): vanilla-ts, vanilla-js, react-ts, react-js. Scaffolding replaces `{{PROJECT_NAME}}` placeholders.
- **Reporter** (`cli/src/utils/reporter.ts`): `withBanner()` wraps command execution with timing and banner display. Respects `--silent` flag and `PYRA_SILENT` env var.

## Platform Architecture (Planned)

See `docs/ARCHITECTURE.md` for the full design. Pyra is evolving into a full-stack app platform with three differentiators: **app-first** (full hydration by default, SSG opt-in), **zero wrapper syntax** (page.tsx IS your React component), and **radical transparency** (request tracing, build reports, Server-Timing headers).

Strategy through v1.0 is **React-first**: only `pyrajs-adapter-react` ships. Core never imports React — the `PyraAdapter` interface enforces the boundary. Other adapters (Svelte, Vue) come post-v1.0 to validate the framework-agnostic design.

Key concepts: file-based routing in `src/routes/` (`page.tsx` for pages, `route.ts` for APIs), `load()` for server-side data, unified dev server with on-demand SSR, build orchestrator producing `dist/client/` + `dist/server/` + `dist/manifest.json`, `pyra start` production runtime, and a `RequestTracer` that instruments every pipeline stage.

Build order will become: **shared → core → adapter-react → cli**. New package: `packages/adapter-react/`.

## Tech Stack

- TypeScript (ES2020, strict mode, bundler module resolution)
- tsup for package builds
- esbuild for production bundling
- Commander.js for CLI
- chokidar for file watching
- ws for WebSocket HMR
- picocolors for terminal output
- Node.js >=18.0.0, ESM output format
