# Pyra Configuration Examples

This directory contains example configuration files demonstrating various use cases for Pyra.js.

## Available Examples

### 1. **pyra.config.minimal.ts** - Zero Config

The simplest possible configuration. Pyra works out-of-the-box with sensible defaults.

```bash
# Just create an empty config or omit it entirely
```

**Use case**: Quick prototypes, learning Pyra

---

### 2. **pyra.config.basic.ts** - Basic Setup

Common options most projects need: custom entry, output directory, port, and path aliases.

```typescript
import { defineConfig } from '@pyra/shared';

export default defineConfig({
  entry: 'src/main.ts',
  outDir: 'build',
  port: 8080,
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
```

**Use case**: Standard single-page applications

---

### 3. **pyra.config.full.ts** - Complete Reference

Comprehensive example showing **all available options** with detailed comments.

Covers:

- Entry points (single & multi-entry)
- Dev server (port, proxy, HTTPS, HMR)
- Build options (minify, sourcemaps, targets)
- Module resolution (aliases, extensions)
- Environment variables
- Build-time constants
- Framework integration
- Custom plugins
- Advanced esbuild options

**Use case**: Reference guide, complex production apps

---

### 4. **pyra.config.mode.ts** - Environment-Specific Config

Use `defineConfigFn` to return different configurations based on mode (development vs production).

```typescript
import { defineConfigFn } from '@pyra/shared';

export default defineConfigFn((mode) => {
  return {
    build: {
      minify: mode === 'production',
      sourcemap: mode === 'development' ? 'inline' : false,
    },
  };
});
```

**Use case**: Different settings for dev vs prod

---

### 5. **pyra.config.react.ts** - React Application

Optimized configuration for React projects with Fast Refresh, JSX, and typical React patterns.

Features:

- React Fast Refresh (HMR for React)
- Automatic JSX runtime
- Common path aliases for React projects
- CSS Modules support

**Use case**: React single-page applications

---

### 6. **pyra.config.library.ts** - Package/Library Development

Setup for building npm packages or shared libraries.

Features:

- Multiple entry points
- External dependencies (peer deps)
- Dual CJS/ESM builds
- No code splitting
- Sourcemap generation

**Use case**: Building publishable npm packages

---

## Quick Start

### 1. Choose Your Template

Copy the example that best matches your use case:

```bash
# For React apps
cp examples/pyra.config.react.ts pyra.config.ts

# For basic projects
cp examples/pyra.config.basic.ts pyra.config.ts

# For libraries
cp examples/pyra.config.library.ts pyra.config.ts
```

### 2. Customize

Open `pyra.config.ts` and adjust values to match your project structure.

### 3. Use TypeScript Autocomplete

The `defineConfig` helper provides full IntelliSense:

```typescript
import { defineConfig } from '@pyra/shared';

export default defineConfig({
  // Your editor will autocomplete all options!
});
```

---

## Configuration Discovery

Pyra automatically searches for configuration files in this order:

1. `pyra.config.ts` (recommended)
2. `pyra.config.js`
3. `pyra.config.mjs`
4. `.pyrarc.ts`
5. `.pyrarc.js`

**Recommended**: Use `pyra.config.ts` for full TypeScript support.

---

## Key Concepts

### Zero Config Philosophy

Pyra works without any configuration:

```typescript
// pyra.config.ts - or even omit this file!
export default {};
```

Defaults:

- **Entry**: `src/index.ts`
- **Output**: `dist/`
- **Port**: `3000`
- **HMR**: Enabled
- **Target**: `es2020`

### Path Aliases

Avoid deep relative imports:

```typescript
resolve: {
  alias: {
    '@': './src',
    '@components': './src/components',
  },
}
```

```typescript
// Instead of: import Button from '../../../components/Button'
import Button from '@components/Button';
```

### Environment Variables

Only variables with the specified prefix are exposed to your client bundle:

```typescript
env: {
  prefix: 'PYRA_', // Only PYRA_* vars are bundled
}
```

```typescript
// .env
PYRA_API_URL=https://api.example.com  // ✅ Available in client
SECRET_KEY=abc123                      // ❌ Server-only
```

### Build-time Constants

Replace values at build time:

```typescript
define: {
  __APP_VERSION__: JSON.stringify('1.0.0'),
  __DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
}
```

```typescript
// In your code
console.log(__APP_VERSION__); // "1.0.0"
if (__DEV__) {
  // Development-only code
}
```

### Proxy for API Requests

Avoid CORS during development:

```typescript
server: {
  proxy: {
    '/api': 'http://localhost:4000',
  },
}
```

```typescript
// Your app makes requests to /api/users
// Pyra proxies to http://localhost:4000/api/users
```

### Plugin System

Extend Pyra with custom logic:

```typescript
plugins: [
  {
    name: 'my-plugin',
    transform(code, id) {
      if (id.endsWith('.custom')) {
        return { code: transformCode(code) };
      }
      return null;
    },
  },
],
```

---

## Common Patterns

### Multi-Page Application

```typescript
entry: {
  main: 'src/main.ts',
  admin: 'src/admin.ts',
  landing: 'src/landing.ts',
},
```

### Monorepo Package

```typescript
resolve: {
  alias: {
    '@shared': '../shared/src',
    '@utils': '../utils/src',
  },
},
```

### Production Optimization

```typescript
build: {
  minify: true,
  splitting: true, // Code splitting
  target: ['es2020', 'chrome91'], // Modern browsers
  chunkSizeWarningLimit: 500, // Warn on large chunks
},
```

### Custom Output Structure

```typescript
build: {
  outDir: 'dist',
  publicDir: 'public', // Static assets
  base: '/my-app/', // Subdirectory deployment
},
```

---

## Tips

1. **Start Minimal**: Begin with `pyra.config.basic.ts` and add options as needed
2. **Use Type Safety**: Always use `defineConfig` for autocomplete
3. **Check Defaults**: Many options have good defaults - only override when necessary
4. **Mode-based Config**: Use `defineConfigFn` for environment-specific settings
5. **Path Aliases**: Set up aliases early to avoid refactoring imports later
6. **Plugins Last**: Add plugins only when built-in features aren't enough

---

## Need Help?

- **Full API Reference**: See `pyra.config.full.ts`
- **Type Definitions**: Check `packages/shared/src/types.ts`
- **Framework Examples**: Check framework-specific configs (React, Vue, etc.)

---

## Contributing

Have a useful configuration pattern? Submit a PR with a new example file!
