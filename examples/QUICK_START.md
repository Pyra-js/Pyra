# Pyra Configuration - Quick Start

Get started with Pyra configuration in **under 2 minutes**.

---

## Step 1: Install Pyra

```bash
npm install -D @pyra/cli
# or
pnpm add -D @pyra/cli
```

---

## Step 2: Choose Your Setup

### Option A: Zero Config ⚡ (Fastest)

**Don't create any config file!** Just run:

```bash
npx pyra dev
```

Pyra uses these defaults:
- Entry: `src/index.ts`
- Output: `dist/`
- Port: `3000`

**When to use:** Quick prototypes, learning Pyra

---

### Option B: Basic Config 📝 (Recommended)

**Create `pyra.config.ts` in your project root:**

```typescript
import { defineConfig } from '@pyra/shared';

export default defineConfig({
  entry: 'src/main.ts',
  port: 8080,
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
```

**Run Pyra:**

```bash
npx pyra dev
```

**When to use:** Real projects, custom entry points, path aliases

---

### Option C: Copy a Template 📋 (Framework-Specific)

**React:**

```bash
# Copy React template
cp node_modules/@pyra/shared/examples/pyra.config.react.ts pyra.config.ts

# Start developing
npx pyra dev --open
```

**Library/Package:**

```bash
# Copy library template
cp node_modules/@pyra/shared/examples/pyra.config.library.ts pyra.config.ts

# Build your package
npx pyra build
```

**When to use:** React apps, Vue apps, npm packages

---

## Step 3: Start Building

### Development Mode

```bash
npx pyra dev

# Or with options
npx pyra dev --port 4000 --open
```

Pyra automatically:
- ✅ Discovers your config
- ✅ Starts dev server with HMR
- ✅ Shows you the local URL

### Production Build

```bash
npx pyra build

# Or with options
npx pyra build --minify --sourcemap
```

---

## Common Usage Patterns

### 1. React Project

```typescript
// pyra.config.ts
import { defineConfig } from '@pyra/shared';

export default defineConfig({
  entry: 'src/main.tsx',
  resolve: {
    alias: {
      '@': './src',
      '@components': './src/components',
    },
  },
  framework: {
    name: 'react',
    options: { refresh: true },
  },
});
```

```bash
npx pyra dev --open
```

### 2. Path Aliases

```typescript
// pyra.config.ts
export default defineConfig({
  resolve: {
    alias: {
      '@': './src',
      '@utils': './src/utils',
      '@components': './src/components',
    },
  },
});
```

```typescript
// Now in your code:
import Button from '@components/Button';
import { format } from '@utils/date';
```

### 3. API Proxy (Avoid CORS)

```typescript
// pyra.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
```

```typescript
// Your app makes requests to /api/users
// Pyra proxies to http://localhost:4000/api/users
fetch('/api/users');
```

### 4. Environment-Specific Config

```typescript
// pyra.config.ts
import { defineConfigFn } from '@pyra/shared';

export default defineConfigFn((mode) => ({
  build: {
    minify: mode === 'production',
    sourcemap: mode === 'development',
  },
  define: {
    __API_URL__: JSON.stringify(
      mode === 'production'
        ? 'https://api.prod.com'
        : 'http://localhost:4000'
    ),
  },
}));
```

```bash
npx pyra dev               # development mode
npx pyra build             # production mode
npx pyra dev --mode production  # test prod settings
```

---

## CLI Override Examples

**Config values can be overridden via CLI:**

```bash
# Override port
npx pyra dev --port 9000

# Use custom config file
npx pyra dev --config custom.config.ts

# Force production mode
npx pyra dev --mode production

# Custom output directory
npx pyra build --out-dir build

# Combine options
npx pyra dev --port 8080 --open --mode production
```

---

## Auto-Discovery Order

Pyra looks for config files in this order (first found wins):

1. `pyra.config.ts` ⭐ **Recommended**
2. `pyra.config.js`
3. `pyra.config.mjs`
4. `pyra.config.cjs`
5. `.pyrarc.ts`
6. `.pyrarc.js`

---

## TypeScript Autocomplete

Get full IntelliSense by using `defineConfig`:

```typescript
import { defineConfig } from '@pyra/shared';

export default defineConfig({
  // Your editor shows ALL available options!
  // Just start typing and see the suggestions
});
```

---

## What's Next?

- 📖 **Detailed usage:** See `examples/USAGE.md`
- 🎨 **All options:** See `examples/pyra.config.full.ts`
- 📚 **Examples:** Browse `examples/` directory
- 🔧 **Framework guides:** React, Vue, Svelte configs

---

## Getting Help

```bash
# Show all CLI commands
npx pyra --help

# Show command-specific help
npx pyra dev --help
npx pyra build --help
```

**That's it! You're ready to use Pyra.** 🔥
