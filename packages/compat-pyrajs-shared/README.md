# pyrajs-shared

> ⚠️ **Deprecated** - this package has been renamed to [`@pyra-js/shared`](https://www.npmjs.com/package/@pyra-js/shared).

This package is a compatibility shim. It re-exports everything from `@pyra-js/shared` so existing projects continue to work without changes, but it will be removed in a future major version.

## Migrating

Most imports from `pyrajs-shared` (like `RequestContext`, `Middleware`, `defineConfig`) can now be imported directly from `@pyra-js/cli`, which is the only package you need in your project:

**1. Update your `package.json`**

```diff
  "devDependencies": {
-   "pyrajs-shared": "^0.21.0"
+   "@pyra-js/cli": "^0.21.0"
  }
```

**2. Update your imports**

```diff
- import { defineConfig } from 'pyrajs-shared';
+ import { defineConfig } from '@pyra-js/cli';

- import type { RequestContext } from 'pyrajs-shared';
+ import type { RequestContext } from '@pyra-js/cli';

- import type { Middleware } from 'pyrajs-shared';
+ import type { Middleware } from '@pyra-js/cli';

- import type { ErrorPageProps } from 'pyrajs-shared';
+ import type { ErrorPageProps } from '@pyra-js/cli';

- import type { CacheConfig } from 'pyrajs-shared';
+ import type { CacheConfig } from '@pyra-js/cli';
```

**3. Reinstall**

```bash
npm install
# or
pnpm install
```

## Why was it renamed?

Pyra's packages moved to the `@pyra-js` npm scope. At the same time, all user-facing types were consolidated into `@pyra-js/cli` so you only ever need one package in your project. See [`@pyra-js/cli`](https://www.npmjs.com/package/@pyra-js/cli) for the full documentation.
