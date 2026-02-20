# pyrajs-shared

Shared types, configuration loader, logger, and network utilities for the Pyra.js framework. This package is an internal dependency — it is consumed by `pyrajs-core`, `pyrajs-adapter-react`, and `pyrajs-cli`. You do not need to install it directly in an application.

## What's in here

### Types (`types.ts`)

The canonical type definitions for the entire framework. Every other package imports from here. Key exports:

| Type | Description |
|------|-------------|
| `PyraConfig` | Full user-facing config object |
| `PyraAdapter` | Interface that framework adapters (React, Svelte, Vue) must implement |
| `PyraPlugin` | Interface for Pyra plugins |
| `RouteNode` | A single node in the route graph |
| `RouteGraph` | The router interface returned by `createRouter()` |
| `RouteMatch` | Result of a URL lookup — matched route + params |
| `ScanResult` | Output of `scanRoutes()` — pages, APIs, layouts, middleware, errors |
| `RequestContext` | Per-request context passed to `load()` and middleware |
| `CookieJar` | Cookie accessor with `get`, `set`, `delete`, `getAll` |
| `Middleware` | `(context, next) => Response \| Promise<Response>` |
| `RenderContext` | Passed from core to the adapter during SSR |
| `RouteManifest` / `ManifestRouteEntry` | Production build manifest types |
| `PyraMode` | `'development' \| 'production'` |
| `RenderMode` | `'ssr' \| 'spa' \| 'ssg'` |
| `ImageConfig` / `ImageManifestEntry` / `ImageFormat` | Image optimization types |
| `ErrorModule` / `ErrorPageProps` | Error boundary types |
| `PrerenderConfig` / `CacheConfig` / `RouteMetadata` | Page export types |

### Config Loader (`config-loader.ts`)

Discovers and loads `pyra.config.ts` (and its variants) from a project root. Handles static objects, mode-aware functions (`defineConfigFn`), and async configs. Merges user config with framework defaults.

```ts
import { loadConfig, resolveConfig, findConfigFile } from 'pyrajs-shared';

const config = await loadConfig({ root: process.cwd(), mode: 'production' });
```

Exported helpers:

| Export | Description |
|--------|-------------|
| `loadConfig(options)` | Main entry point — finds, loads, and resolves config |
| `findConfigFile(root)` | Returns the first config file found, or `null` |
| `loadConfigFile(path, mode)` | Loads a specific file and evaluates it |
| `resolveConfig(userConfig, mode)` | Merges user config with defaults |
| `validateConfig(config)` | Throws on invalid values (bad port, missing root, etc.) |
| `getPort(config)` | Returns the effective port number |
| `getOutDir(config)` | Returns the effective output directory |
| `getEntry(config)` | Returns the effective entry point(s) |
| `defineConfig(config)` | Identity helper for editor type inference |
| `defineConfigFn(fn)` | Identity helper for mode-aware config functions |
| `DEFAULT_CONFIG` | The framework-level default values |

Config files are resolved in this order:

```
pyra.config.ts → pyra.config.js → pyra.config.mjs → pyra.config.cjs → .pyrarc.ts → .pyrarc.js → .pyrarc.mjs
```

### Logger (`logger.ts`)

A minimal colored logger used throughout the framework. Prefixes every message with `[pyra]` in the appropriate color.

```ts
import { log } from 'pyrajs-shared';

log.info('Server started');    // cyan
log.success('Build complete'); // green
log.warn('Missing field');     // yellow
log.error('Compile failed');   // red
```

### Network Utilities (`net-utils.ts`)

Helpers for network-related tasks used by the dev and production servers.

---

## For contributors

This package is the **first** in the build order — everything else depends on it. If you change a type here, rebuild this package before rebuilding `core`, `adapter-react`, or `cli`:

```bash
cd packages/shared
pnpm build
```

The adapter boundary is enforced through this package's types: `PyraAdapter` and `RenderContext` define exactly what `core` can pass to adapters without ever importing React or any other UI framework directly.

## License

MIT
