# pyrajs-adapter-react

> ⚠️ **Deprecated** - this package has been renamed to [`@pyra-js/adapter-react`](https://www.npmjs.com/package/@pyra-js/adapter-react).

This package is a compatibility shim. It re-exports everything from `@pyra-js/adapter-react` so existing projects continue to work without changes, but it will be removed in a future major version.

## Migrating

**1. Update your `package.json`**

```diff
  "dependencies": {
-   "pyrajs-adapter-react": "^0.21.0"
+   "@pyra-js/adapter-react": "^0.21.0"
  }
```

**2. Update your imports**

```diff
- import { createReactAdapter } from 'pyrajs-adapter-react';
+ import { createReactAdapter } from '@pyra-js/adapter-react';
```

**3. Reinstall**

```bash
npm install
# or
pnpm install
```

That's it. The API is identical, no other changes needed.

## Note

`@pyra-js/adapter-react` is an internal framework package. Application developers typically do not install it directly — it is a dependency of `@pyra-js/cli`. See [`@pyra-js/cli`](https://www.npmjs.com/package/@pyra-js/cli) for the main Pyra documentation.
