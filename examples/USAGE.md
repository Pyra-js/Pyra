# How to Use Pyra Configuration

This guide explains how users actually use Pyra configuration files in their projects.

## Quick Start

### 1. Create a Config File

In your project root, create `pyra.config.ts`:

```typescript
import { defineConfig } from '@pyra/shared';

export default defineConfig({
  entry: 'src/index.ts',
  port: 3000,
});
```

**That's it!** Pyra will automatically discover and load this file.

---

## Configuration Discovery

Pyra automatically searches for configuration files in your project root in this order:

1. `pyra.config.ts` ⭐ **Recommended** (TypeScript with full IntelliSense)
2. `pyra.config.js` (JavaScript/ES modules)
3. `pyra.config.mjs` (ES modules explicitly)
4. `pyra.config.cjs` (CommonJS)
5. `.pyrarc.ts` (Alternative TypeScript name)
6. `.pyrarc.js` (Alternative JavaScript name)
7. `.pyrarc.mjs` (Alternative ES module name)

**The first file found is used.**

---

## Usage Examples

### Zero Config (No File Needed)

Pyra works without any configuration:

```bash
# Just run Pyra - it uses intelligent defaults
pyra dev
```

Defaults:
- Entry: `src/index.ts`
- Output: `dist/`
- Port: `3000`
- Mode: `development`

### Basic Config

Create `pyra.config.ts`:

```typescript
import { defineConfig } from '@pyra/shared';

export default defineConfig({
  entry: 'src/main.tsx',
  port: 8080,
  outDir: 'build',
});
```

Run Pyra:

```bash
pyra dev    # Uses your config
pyra build  # Uses your config
```

### Override Config via CLI

CLI options always override config file values:

```bash
# Port from CLI overrides config
pyra dev --port 4000

# Custom config file location
pyra dev --config custom.config.ts

# Different mode
pyra dev --mode production
```

### Mode-Based Configuration

Create `pyra.config.ts` that returns different configs per mode:

```typescript
import { defineConfigFn } from '@pyra/shared';

export default defineConfigFn((mode) => {
  return {
    entry: 'src/index.ts',
    build: {
      minify: mode === 'production',
      sourcemap: mode === 'development' ? 'inline' : false,
    },
    server: {
      port: mode === 'development' ? 3000 : 8080,
    },
  };
});
```

Run with different modes:

```bash
pyra dev               # mode: 'development'
pyra build             # mode: 'production'
pyra dev --mode production  # Force production mode in dev
```

---

## Command Reference

### `pyra dev`

Start the development server.

```bash
pyra dev [options]
```

**Options:**
- `-p, --port <number>` - Dev server port (overrides config)
- `-o, --open` - Open browser on start (overrides config)
- `-c, --config <path>` - Path to config file (default: auto-discovered)
- `--mode <mode>` - Build mode: `development` or `production` (default: `development`)

**Examples:**

```bash
# Use auto-discovered config
pyra dev

# Custom port
pyra dev --port 8080

# Open browser
pyra dev --open

# Custom config file
pyra dev --config configs/dev.config.ts

# Production mode in dev (testing)
pyra dev --mode production
```

### `pyra build`

Build for production.

```bash
pyra build [options]
```

**Options:**
- `-o, --out-dir <path>` - Output directory (overrides config)
- `--minify` - Enable minification (overrides config)
- `--sourcemap` - Generate sourcemaps (overrides config)
- `-c, --config <path>` - Path to config file
- `--mode <mode>` - Build mode (default: `production`)

**Examples:**

```bash
# Production build with auto-discovered config
pyra build

# Custom output directory
pyra build --out-dir dist-prod

# Disable minification
pyra build --minify=false

# Generate sourcemaps
pyra build --sourcemap

# Development build
pyra build --mode development
```

---

## Configuration Priority

Settings are applied in this order (later overrides earlier):

1. **Default values** (`src/index.ts`, `dist/`, port `3000`, etc.)
2. **Config file** (`pyra.config.ts`)
3. **Environment variables** (if applicable)
4. **CLI flags** (`--port 8080`, `--mode production`, etc.)

**Example:**

```typescript
// pyra.config.ts
export default defineConfig({
  port: 3000,        // Config file says 3000
});
```

```bash
pyra dev --port 8080   # CLI says 8080 → uses 8080 ✅
```

---

## Real-World Workflows

### Workflow 1: React SPA

```bash
# 1. Copy React template
cp examples/pyra.config.react.ts pyra.config.ts

# 2. Customize for your project
# Edit pyra.config.ts with your paths/aliases

# 3. Develop
pyra dev --open

# 4. Build
pyra build
```

### Workflow 2: Monorepo Package

```bash
# 1. Use library template
cp examples/pyra.config.library.ts pyra.config.ts

# 2. Configure entry points
# Edit config to match your package exports

# 3. Build library
pyra build

# 4. Test in development
pyra dev
```

### Workflow 3: Multi-Environment Setup

```bash
# Project structure:
# - pyra.config.ts          (shared base config)
# - pyra.config.dev.ts      (dev-specific)
# - pyra.config.prod.ts     (prod-specific)

# Development
pyra dev --config pyra.config.dev.ts

# Staging
pyra build --config pyra.config.staging.ts

# Production
pyra build --config pyra.config.prod.ts
```

### Workflow 4: Team Presets

```bash
# Create shared configs directory
mkdir configs/
cp examples/pyra.config.react.ts configs/preset-react.ts
cp examples/pyra.config.library.ts configs/preset-lib.ts

# Team members use presets
pyra dev --config configs/preset-react.ts
```

---

## TypeScript Support

### Full IntelliSense

Using `defineConfig` provides full autocomplete:

```typescript
import { defineConfig } from '@pyra/shared';

export default defineConfig({
  // Your editor shows all available options!
  server: {
    port: 3000,
    // Autocomplete suggests: host, https, open, hmr, cors, proxy...
  }
});
```

### Type-Safe Plugins

```typescript
import type { PyraPlugin } from '@pyra/shared';

const myPlugin: PyraPlugin = {
  name: 'my-plugin',
  setup(api) {
    // Fully typed API!
  },
};

export default defineConfig({
  plugins: [myPlugin],
});
```

---

## Common Patterns

### Pattern 1: Shared Base + Environment Override

```typescript
// pyra.config.base.ts
export const baseConfig = {
  resolve: {
    alias: {
      '@': './src',
    },
  },
};

// pyra.config.ts
import { defineConfig } from '@pyra/shared';
import { baseConfig } from './pyra.config.base';

export default defineConfig({
  ...baseConfig,
  port: 3000,
});
```

### Pattern 2: Dynamic Environment Variables

```typescript
import { defineConfigFn } from '@pyra/shared';

export default defineConfigFn((mode) => ({
  define: {
    'import.meta.env.MODE': JSON.stringify(mode),
    'import.meta.env.API_URL': JSON.stringify(
      mode === 'production'
        ? 'https://api.production.com'
        : 'http://localhost:4000'
    ),
  },
}));
```

### Pattern 3: Conditional Plugins

```typescript
import { defineConfigFn } from '@pyra/shared';
import { bundleAnalyzer } from '@pyra/plugins';

export default defineConfigFn((mode) => ({
  plugins: [
    // Only analyze in production
    ...(mode === 'production' ? [bundleAnalyzer()] : []),
  ],
}));
```

---

## Troubleshooting

### "No config file found"

**Cause:** Pyra can't find a config file in your project root.

**Solution:**
- ✅ Create `pyra.config.ts` in your project root
- ✅ Or run without config (uses defaults)
- ✅ Or specify path: `pyra dev --config path/to/config.ts`

### "Failed to load config"

**Cause:** Syntax error or import issues in your config file.

**Solution:**
- ✅ Check for TypeScript errors: `npx tsc --noEmit pyra.config.ts`
- ✅ Ensure imports are correct: `import { defineConfig } from '@pyra/shared'`
- ✅ Check the error message for specific issues

### Config not taking effect

**Cause:** CLI flags override config, or wrong file is loaded.

**Solution:**
- ✅ Check which file is loaded: Look for "Loading config from..." message
- ✅ Remove CLI flags to test config values
- ✅ Verify config file is in project root

### TypeScript config not working

**Cause:** Trying to use TypeScript config without proper setup.

**Solution:**
- ✅ Ensure you have TypeScript installed: `npm install -D typescript`
- ✅ Pyra handles `.ts` configs automatically - no transpilation needed!

---

## FAQ

**Q: Do I need a config file?**
A: No! Pyra works with zero config. Only create one when you need custom settings.

**Q: Can I use JavaScript instead of TypeScript?**
A: Yes! Use `.js` or `.mjs` extensions. But TypeScript is recommended for IntelliSense.

**Q: How do I see what config Pyra is using?**
A: Pyra logs "Loading config from..." when it finds a file. Add `console.log(config)` in your config to debug.

**Q: Can I have multiple config files?**
A: Yes! Use `--config` flag: `pyra dev --config custom.config.ts`

**Q: Does Pyra support `.json` or `.yaml` configs?**
A: No. Pyra uses JS/TS files for maximum flexibility (functions, conditionals, imports).

---

## Next Steps

- 📚 See **README.md** for all config options
- 🔍 Explore **examples/** for copy-paste templates
- 🎨 Check **pyra.config.full.ts** for complete API reference
- 🚀 Read framework guides (React, Vue, Svelte)
