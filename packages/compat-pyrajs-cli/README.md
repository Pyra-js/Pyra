# pyrajs-cli

> ⚠️ **Deprecated** - this package has been renamed to [`@pyra-js/cli`](https://www.npmjs.com/package/@pyra-js/cli).

This package is a compatibility shim. It re-exports everything from `@pyra-js/cli` so existing projects continue to work without changes, but it will be removed in a future major version.

## Migrating

**1. Update your `package.json`**

```diff
  "devDependencies": {
-   "pyrajs-cli": "^0.21.0"
+   "@pyra-js/cli": "^0.21.0"
  }
```

**2. Update your config file**

```diff
- import { defineConfig } from 'pyrajs-cli';
+ import { defineConfig } from '@pyra-js/cli';
```

**3. Reinstall**

```bash
npm install
# or
pnpm install
```

That's it. The API is identical, no other changes needed.

## Why was it renamed?

Pyra's packages moved to the `@pyra-js` npm scope for consistency and to group all official packages under one namespace. See [`@pyra-js/cli`](https://www.npmjs.com/package/@pyra-js/cli) for the full documentation.
