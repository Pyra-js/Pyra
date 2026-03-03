# pyrajs-core

> ⚠️ **Deprecated** - this package has been renamed to [`@pyra-js/core`](https://www.npmjs.com/package/@pyra-js/core).

This package is a compatibility shim. It re-exports everything from `@pyra-js/core` so existing projects continue to work without changes, but it will be removed in a future major version.

## Migrating

**1. Update your `package.json`**

```diff
  "dependencies": {
-   "pyrajs-core": "^0.21.0"
+   "@pyra-js/core": "^0.21.0"
  }
```

**2. Update your imports**

```diff
- import { DevServer, ProdServer, build } from 'pyrajs-core';
+ import { DevServer, ProdServer, build } from '@pyra-js/core';
```

**3. Reinstall**

```bash
npm install
# or
pnpm install
```

That's it. The API is identical, no other changes needed.

## Note

`@pyra-js/core` is an internal framework package. Application developers typically do not install it directly — it is a dependency of `@pyra-js/cli`. See [`@pyra-js/cli`](https://www.npmjs.com/package/@pyra-js/cli) for the main Pyra documentation.
