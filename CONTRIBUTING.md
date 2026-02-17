# Contributing to Pyra.js

Thanks for your interest in contributing to Pyra.js! This guide covers everything you need to get started.

## Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** 10.x (the project uses `pnpm@10.17.1`)
- **Git**

## Getting Started

```bash
# Clone the repository
git clone https://github.com/Natejsx/Pyra.git
cd Pyra

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Link the CLI globally for manual testing
pnpm dev:link
```

## Monorepo Structure

Pyra is a pnpm workspace monorepo with four packages. They must be built in this order because each depends on the previous:

```
shared → core → adapter-react → cli
```

| Package | npm Name | Description |
|---------|----------|-------------|
| `packages/shared` | `pyrajs-shared` | Types, config loader, logger, network utilities |
| `packages/core` | `pyrajs-core` | Dev server, prod server, bundler, router, scanner, tracer, metrics |
| `packages/adapter-react` | `pyrajs-adapter-react` | React SSR adapter (renderToString, hydration) |
| `packages/cli` | `pyrajs-cli` | CLI commands, scaffolding, graph visualization, templates |

## Development Workflow

### Building

```bash
# Build all packages (respects dependency order)
pnpm build

# Build a single package
cd packages/core && pnpm build

# Watch mode (core only — useful during active development)
cd packages/core && pnpm dev

# Run the CLI without building
cd packages/cli && pnpm dev:run
```

### Type Checking

```bash
# Type check all packages via project references
pnpm typecheck

# Type check a single package
cd packages/shared && npx tsc --noEmit
cd packages/core && npx tsc --noEmit
cd packages/cli && npx tsc --noEmit
```

### Testing the CLI

```bash
# Link the CLI globally
pnpm dev:link

# Now you can use the CLI anywhere
pyra dev
pyra build
pyra doctor

# Unlink when done
pnpm dev:unlink
```

### Clean Build

```bash
# Remove all dist/ directories and build artifacts
pnpm clean
```

## Coding Guidelines

### TypeScript

- Always write TypeScript. No plain JavaScript source files.
- Define types explicitly. Avoid `any` unless absolutely necessary.
- Use shared types from `pyrajs-shared`, import from `'pyrajs-shared'` in core, adapter-react, and cli packages.
- Prefer `interface` over `type` for object shapes.
- Use `export type` for type-only exports.

### Module System

- All packages use **ESM** (`"type": "module"` in package.json).
- Use `.js` extensions in import paths (TypeScript requires this for ESM resolution):
  ```typescript
  // Correct
  import { log } from './logger.js';

  // Incorrect
  import { log } from './logger';
  ```
- Use `node:` prefix for Node.js built-in modules:
  ```typescript
  import fs from 'node:fs';
  import path from 'node:path';
  ```

### Code Style

- Use double quotes for strings in source files.
- Use 2-space indentation.
- Use `picocolors` (imported as `pc`) for terminal coloring, not chalk or other alternatives.
- Use `log` from `pyrajs-shared` for user-facing console output:
  ```typescript
  import { log } from 'pyrajs-shared';
  log.info('Server started');
  log.error('Build failed');
  ```

## Commit Guidelines

We follow Conventional Commits for clear git history:

Types

* **feat:** - New feature
* **fix:** - Bug fix
* **docs:** - Documentation changes
* **style:** - Code style changes (formatting, no logic change)
* **refactor:** - Code refactoring
* **test:** - Adding or updating tests
* **chore:** - Maintenance tasks, dependency updates
Examples

### File Conventions

- **Route sentinel files**: `page.tsx` (pages), `route.ts` (API routes), `layout.tsx` (layouts), `middleware.ts` (middleware)
- **Config files**: `pyra.config.ts` is the primary config filename
- **Package entry points**: Each package exports from `src/index.ts`

### Architecture Boundaries

- **Core never imports React.** The `PyraAdapter` interface is the boundary. Core calls adapter methods with opaque `component` and `data` values.
- **Shared has no dependencies on core or cli.** It only provides types, config loading, and utilities.
- **CLI depends on all other packages.** It wires everything together (adapter, core, shared).

## Adding New Features

### Adding a Type

1. Define it in `packages/shared/src/types.ts`.
2. It's automatically exported via `export * from './types.js'` in `packages/shared/src/index.ts`.
3. Import it in other packages with `import type { YourType } from 'pyrajs-shared'`.

### Adding a Core Module

1. Create the file in `packages/core/src/`.
2. Export public API from `packages/core/src/index.ts`.
3. Use `export type` for type-only re-exports.

### Adding a CLI Command

1. Define the command in `packages/cli/src/bin.ts` using Commander.js.
2. For complex commands, create a separate file in `packages/cli/src/commands/`.
3. Follow existing patterns: load config, use `isSilent()`/`useColor()`, print banner, handle errors with `process.exit(1)`.

### Adding a Template

1. Create a directory under `packages/cli/templates/` (e.g., `svelte-ts/`).
2. Include at minimum: `package.json`, `pyra.config.ts`, `index.html`, and a `src/` directory.
3. Use `{{PROJECT_NAME}}` as a placeholder in `package.json`, scaffolding replaces it.
4. Templates are copied to `dist/templates/` during the CLI build via `scripts/copy-templates.mjs`.

## Project Conventions

### Route File System

Routes live in `src/routes/` within a Pyra project:

```
src/routes/
  page.tsx              → /
  layout.tsx            → Root layout (wraps all pages)
  middleware.ts          → Root middleware (runs on all routes)
  about/
    page.tsx            → /about
  blog/
    page.tsx            → /blog
    [slug]/
      page.tsx          → /blog/:slug (dynamic)
  api/
    users/
      route.ts          → /api/users (API endpoint)
  (marketing)/
    pricing/
      page.tsx          → /pricing (route group — parentheses stripped from URL)
```

### Router Priority

The trie-based router matches URLs with this priority:
1. **Static segments** - exact match (e.g., `/blog/featured`)
2. **Dynamic segments** - parameterized (e.g., `/blog/:slug`)
3. **Catch-all segments** - rest params (e.g., `/docs/*path`)

### Request Pipeline (Dev Server)

```
Request → Route Match → Middleware Chain → Compile → load() → Render → Inject Assets → Response
```

Each stage is instrumented by the `RequestTracer` for performance visibility.

## Documentation

- `docs/ARCHITECTURE.md` - Full platform architecture and milestone roadmap
- `docs/CONFIG_SYSTEM.md` - Configuration system details
- `docs/SSR.md` - SSR implementation details
- `CLAUDE.md` - AI assistant context for the codebase

## Submitting Changes

1. Fork the repository and create a feature branch from `master`.
2. Make your changes following the coding guidelines above.
3. Ensure all packages build cleanly: `pnpm build`
4. Ensure type checking passes: `pnpm typecheck`
5. Write a clear commit message describing what changed and why.
6. Open a pull request against `master`.

## Reporting Issues

File issues at [github.com/Natejsx/Pyra/issues](https://github.com/Natejsx/Pyra/issues). Include:

- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS
- Relevant config or error output

## License

Pyra.js is [MIT licensed](https://opensource.org/licenses/MIT). By contributing, you agree that your contributions will be licensed under the same license.
