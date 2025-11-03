# Pyra Configuration System

Complete reference for the Pyra.js configuration system.

---

## Overview

Pyra's configuration system is designed around three core principles:

1. **Zero-config by default** - Works without any setup
2. **Familiar and intuitive** - TypeScript-first with full IntelliSense
3. **Powerfully extensible** - Supports plugins, modes, and overrides

---

## How It Works

### 1. Auto-Discovery

When you run `pyra dev` or `pyra build`, Pyra automatically searches for config files:

```
Project Root
├── pyra.config.ts    ← Looks here first ⭐
├── pyra.config.js    ← Then here
├── pyra.config.mjs   ← Then here
├── .pyrarc.ts        ← Alternative names
└── src/
```

**No manual loading required!** Pyra finds and loads the first matching file.

### 2. Configuration Loading

The loading process (implemented in `packages/shared/src/config-loader.ts`):

```typescript
// 1. Discover config file
const configPath = findConfigFile(process.cwd());

// 2. Load and parse (supports both static and function configs)
const config = await loadConfigFile(configPath, mode);

// 3. Merge with defaults
const finalConfig = resolveConfig(config, mode);

// 4. CLI flags override config values
const port = cliOptions.port || finalConfig.server?.port || 3000;
```

### 3. Configuration Priority

Settings are applied in this order (later overrides earlier):

```
1. Defaults        (entry: 'src/index.ts', port: 3000, etc.)
   ↓
2. Config File     (pyra.config.ts values)
   ↓
3. CLI Flags       (--port 8080, --mode production)
   ↓
4. Final Config    (merged and resolved)
```

---

## File Structure

### Type Definitions

**Location:** `packages/shared/src/types.ts`

```typescript
export type PyraConfig = {
  entry?: string | string[] | Record<string, string>;
  outDir?: string;
  port?: number;
  mode?: PyraMode;
  server?: DevServerConfig;
  build?: BuildConfig;
  resolve?: ResolveConfig;
  env?: EnvConfig;
  plugins?: PyraPlugin[];
  // ... more options
};
```

### Config Loader

**Location:** `packages/shared/src/config-loader.ts`

**Key Functions:**

- `findConfigFile(root)` - Discovers config files
- `loadConfigFile(path, mode)` - Loads and parses config
- `resolveConfig(config, mode)` - Merges with defaults
- `loadConfig(options)` - Main entry point (used by CLI)

### CLI Integration

**Location:** `packages/cli/src/bin.ts`

```typescript
import { loadConfig, getPort } from '@pyra/shared';

// In dev command
const config = await loadConfig({
  mode: options.mode,
  configFile: options.config,
});

const port = options.port || getPort(config);
```

---

## Configuration Types

### 1. Static Configuration

Simple object export:

```typescript
// pyra.config.ts
import { defineConfig } from '@pyra/shared';

export default defineConfig({
  entry: 'src/index.ts',
  port: 3000,
});
```

### 2. Function-Based Configuration

Dynamic config based on mode:

```typescript
// pyra.config.ts
import { defineConfigFn } from '@pyra/shared';

export default defineConfigFn((mode) => ({
  build: {
    minify: mode === 'production',
  },
}));
```

### 3. Async Configuration

Load external data:

```typescript
// pyra.config.ts
import { defineConfig } from '@pyra/shared';

export default defineConfig(async () => {
  const data = await fetchSomeData();
  return {
    define: { __DATA__: JSON.stringify(data) },
  };
});
```

---

## Usage Examples

### For Users (Application Developers)

**Step 1:** Create `pyra.config.ts` in project root

```typescript
import { defineConfig } from '@pyra/shared';

export default defineConfig({
  entry: 'src/main.tsx',
  port: 8080,
  resolve: {
    alias: { '@': './src' },
  },
});
```

**Step 2:** Run Pyra

```bash
npx pyra dev  # Config auto-loaded! 🎉
```

### For Plugin Authors

```typescript
import type { PyraPlugin } from '@pyra/shared';

export function myPlugin(): PyraPlugin {
  return {
    name: 'my-plugin',
    config(config, mode) {
      // Modify config before it's finalized
      return {
        ...config,
        define: {
          ...config.define,
          __PLUGIN__: true,
        },
      };
    },
    setup(api) {
      const config = api.getConfig();
      // Use config values
    },
  };
}
```

---

## CLI Commands

### `pyra dev`

```bash
pyra dev [options]

Options:
  -p, --port <number>    Dev server port
  -o, --open            Open browser on start
  -c, --config <path>   Path to config file
  --mode <mode>         Build mode (development|production)
```

### `pyra build`

```bash
pyra build [options]

Options:
  -o, --out-dir <path>  Output directory
  --minify              Enable minification
  --sourcemap           Generate sourcemaps
  -c, --config <path>   Path to config file
  --mode <mode>         Build mode (default: production)
```

---

## Configuration Reference

### Core Options

```typescript
{
  // Entry point(s)
  entry: 'src/index.ts',
  // or: ['src/a.ts', 'src/b.ts']
  // or: { main: 'src/main.ts', admin: 'src/admin.ts' }

  // Output directory (shorthand for build.outDir)
  outDir: 'dist',

  // Dev server port (shorthand for server.port)
  port: 3000,

  // Build mode
  mode: 'development' | 'production',

  // Project root
  root: process.cwd(),
}
```

### Server Options

```typescript
{
  server: {
    port: 3000,
    host: 'localhost',
    https: false,
    open: false,
    hmr: true,
    cors: true,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  }
}
```

### Build Options

```typescript
{
  build: {
    outDir: 'dist',
    sourcemap: true | false | 'inline' | 'external',
    minify: true,
    target: 'es2020' | ['es2020', 'chrome91'],
    external: ['react', 'react-dom'],
    splitting: true,
  }
}
```

### Resolve Options

```typescript
{
  resolve: {
    alias: {
      '@': './src',
      '@components': './src/components',
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  }
}
```

### Environment Variables

```typescript
{
  env: {
    dir: process.cwd(),
    prefix: 'PYRA_', // Only PYRA_* vars exposed to client
    files: ['.env.local'],
  }
}
```

### Plugins

```typescript
{
  plugins: [
    {
      name: 'my-plugin',
      setup(api) { /* ... */ },
      transform(code, id) { /* ... */ },
    }
  ]
}
```

---

## Documentation Files

- **`examples/QUICK_START.md`** - Get started in 2 minutes
- **`examples/USAGE.md`** - Detailed usage guide with patterns
- **`examples/README.md`** - Overview of all example configs
- **`examples/pyra.config.full.ts`** - Complete API reference with comments
- **`examples/pyra.config.*.ts`** - Copy-paste templates

---

## Implementation Details

### Config File Resolution

```typescript
// packages/shared/src/config-loader.ts

const CONFIG_FILES = [
  'pyra.config.ts',
  'pyra.config.js',
  'pyra.config.mjs',
  'pyra.config.cjs',
  '.pyrarc.ts',
  '.pyrarc.js',
  '.pyrarc.mjs',
];

export function findConfigFile(root: string): string | null {
  for (const fileName of CONFIG_FILES) {
    const filePath = join(root, fileName);
    if (existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}
```

### Dynamic Import

TypeScript config files are loaded using Node's dynamic import:

```typescript
const fileUrl = pathToFileURL(configPath).href;
const configModule = await import(fileUrl);
let config = configModule.default;

// Handle function configs
if (typeof config === 'function') {
  config = await config(mode);
}
```

### Default Values

```typescript
export const DEFAULT_CONFIG = {
  entry: 'src/index.ts',
  outDir: 'dist',
  port: 3000,
  mode: 'development',
  root: process.cwd(),
};
```

---

## Testing the Config System

See `examples/test-config/` for a working demo:

```bash
cd examples/test-config
pyra dev  # Loads pyra.config.ts automatically!
```

---

## Future Enhancements

- [ ] JSON Schema validation
- [ ] Config file templates via `pyra init`
- [ ] Interactive config builder
- [ ] Config migration tools
- [ ] Performance profiling for plugin configs

---

## Summary

**For Users:**
1. Create `pyra.config.ts` (or don't, for zero-config!)
2. Run `pyra dev` or `pyra build`
3. Config is auto-discovered and loaded
4. Enjoy full TypeScript IntelliSense

**For Contributors:**
- Config types: `packages/shared/src/types.ts`
- Config loader: `packages/shared/src/config-loader.ts`
- CLI integration: `packages/cli/src/bin.ts`
- Examples: `examples/`

---

**The config system is production-ready and fully functional!** 🎉
