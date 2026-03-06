# API Stability

This document defines the stability guarantees for Pyra.js packages starting at v1.0.

## Stability levels

| Level | Meaning |
|-------|---------|
| **Stable** | Covered by semver. Breaking changes only in major versions. |
| **Experimental** | Public but evolving. May change in minor versions with a deprecation notice. |
| **Internal** | No stability promise. May change in any release. Do not depend on it. |

---

## `@pyra-js/cli` - Stable

The primary package for application developers. All public exports are stable.

### Config helpers
- `defineConfig(config)`
- `defineConfigFn(fn)`

### Types
- `PyraConfig` and all nested config types (`DevServerConfig`, `BuildConfig`, `ResolveConfig`, `EnvConfig`, `CorsConfig`)
- `RequestContext`
- `Middleware`
- `ErrorPageProps`
- `CacheConfig`
- `PrerenderConfig`
- `PyraMode`
- `RenderMode`

### Route file contracts
The following exports from route files are stable:

| Export | File | Description |
|--------|------|-------------|
| `default` | `page.tsx` | Page component |
| `load(ctx)` | `page.tsx` | Server-side data loader |
| `cache` | `page.tsx` | Cache-Control hints |
| `prerender` | `page.tsx` | SSG configuration |
| `render` | `page.tsx` | Per-route render mode override |
| `default` | `layout.tsx` | Layout component |
| `default` / `middleware` | `middleware.ts` | Middleware function |
| `default` | `error.tsx` | Error boundary component |
| `default` | `404.tsx` | Not-found page component |
| `GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS` | `route.ts` | API route handlers |

### CLI commands and flags
All commands and their documented flags are stable:

- `pyra dev` - `--port`, `--open`, `--config`, `--mode`, `--verbose`
- `pyra build` - `--out-dir`, `--minify`, `--sourcemap`, `--config`, `--mode`, `--silent`
- `pyra start` - `--port`, `--config`, `--dist`, `--silent`
- `pyra init` - `--template`, `--language`, `--pm`, `--tailwind`, `--ui`, `--skip-install`, `--force`, `--silent`
- `pyra graph` - `--format`, `--outfile`, `--open`, `--filter`, `--cycles`, `--stats`, `--silent`
- `pyra doctor` - `--config`, `--silent`

---

## `@pyra-js/adapter-react` - Stable

All documented public exports are stable.

- `createReactAdapter()` - factory function, return type is `PyraAdapter`
- `<Link>` - client-side navigation component
- `<NavLink>` - active-state navigation component
- `<Image>` - responsive image component
- `<Head>` - document head manager
- `<ClientOnly>` - browser-only render wrapper
- `<Form>` - enhanced form component
- `useLocation()`
- `useNavigate()`
- `useParams()`
- `useSearchParams()`
- `useNavigating()`
- `usePreload()`
- `useBeforeNavigate()`
- `useScrollRestoration()`
- `useRouteError()`

---

## `dist/manifest.json` - Stable (format version 1)

The build manifest written by `pyra build` and read by `pyra start` is a stable format. The `version` field will be incremented if a breaking structural change is ever required. Tools and deploy adapters may safely read the v1 format.

Fields guaranteed stable in v1: `version`, `adapter`, `base`, `builtAt`, `renderMode`, `routes`, `assets`, `spaFallback`, `images`.

---

## `PyraAdapter` interface - Experimental

`PyraAdapter` is exported from `@pyra-js/shared` and is the contract between the core runtime and framework adapters. It is **not** re-exported from `@pyra-js/cli` and is not considered stable in v1.x.

**Why experimental:** The interface was extended in recent releases (`getHMRPreamble`, `renderToStream`) and is expected to evolve further as streaming SSR matures and additional adapters are developed. Locking it prematurely would make those improvements breaking changes.

**What this means in practice:**
- `@pyra-js/adapter-react` is the only officially supported adapter in v1.x
- Third-party adapters can be built against `PyraAdapter` but should pin to a specific minor version
- The interface will not change in patch releases
- Minor version changes may extend the interface with new optional methods
- The interface will be declared stable (moved to `@pyra-js/cli`) in v2.0 once validated against a second first-party adapter

---

## `@pyra-js/core` - Internal

All exports from `@pyra-js/core` are internal. This includes `DevServer`, `ProdServer`, `bundleFile`, `createRouter`, `scanRoutes`, `buildMatcher`, `RequestTracer`, `MetricsStore`, and all sub-path imports (`@pyra-js/core/dev/*`, `@pyra-js/core/prod/*`, `@pyra-js/core/build/*`).

Do not import from `@pyra-js/core` directly. If you need something that is only accessible from core, open an issue - the right fix is to promote it to a stable API, not to depend on an internal.

---

## `@pyra-js/shared` - Internal

`@pyra-js/shared` is an internal package. Its types and utilities are consumed by the other Pyra packages and are not intended for application developers. Use `@pyra-js/cli` instead, which re-exports everything application code needs.

---

## `create-pyra` - Stable (scaffold output only)

The `npm create pyra` scaffolder is stable in the sense that it will always produce a working project. The interactive prompts and the generated file structure may evolve between minor versions as templates are improved. The generated code itself (what ends up in your project) is yours, it is not versioned by Pyra.

---

## Compat shims (`pyrajs-*`) - Deprecated

The `pyrajs-shared`, `pyrajs-core`, `pyrajs-adapter-react`, and `pyrajs-cli` packages are deprecated compatibility shims that re-export from the `@pyra-js/*` scoped packages. They will continue to receive version bumps in sync with the main packages throughout v0.x but will be removed in v1.0.

**Migrate by replacing imports:**
```diff
- import { defineConfig } from "pyrajs-cli"
+ import { defineConfig } from "@pyra-js/cli"
```

---

## Semver policy

Pyra follows [Semantic Versioning 2.0.0](https://semver.org).

- **Patch** (`0.27.x`): bug fixes, documentation, performance improvements, no API changes
- **Minor** (`0.x.0`): new features, new optional config fields, new optional adapter methods, backward compatible; experimental APIs may change
- **Major** (`x.0.0`): breaking changes to stable APIs only

The pre-1.0 releases (`0.x.x`) follow the same intent but reserve the right to make breaking changes in minor versions with clear changelog notices, as the project approaches API stability.
