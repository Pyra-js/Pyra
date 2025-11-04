# Testing Guide for Pyra.js Development

This guide explains how to properly test your changes in external projects.

## The Problem

When developing Pyra.js, there are **two versions** that can exist:

1. **Local development version** - Your local code in `/c/web_development/projects/Pyrajs/`
2. **Published npm version** - The version published to npm (currently `pyrajs-cli@0.0.3`)

When testing external projects, you want to use the **local development version**, not the old published version.

## The Solution: Global Linking

Use `npm link` to create a symlink from your global npm directory to your local development code.

### Step-by-Step Setup

```bash
# 1. Build and link globally (do this once)
cd /c/web_development/projects/Pyrajs
pnpm dev:link
```

This command:

- Builds all packages
- Creates a global symlink: `npm` → your local `packages/cli/`
- Makes the `pyra` command use your local code

### Verify the Link

```bash
# Check where the global pyra points
ls -la /c/Users/$(whoami)/AppData/Roaming/npm/node_modules/ | grep pyrajs

# You should see:
# lrwxrwxrwx ... pyrajs-cli -> /c/web_development/projects/Pyrajs/packages/cli
```

The `l` at the start means it's a **symlink** (good!). If you see `d`, it's a directory (bad - means it installed the published version).

## Testing External Projects

### Option 1: No Installation Required (Recommended)

Since `pyra` is globally linked, you don't need to install it in test projects:

```bash
# Create a test project
cd /c/web_development/pyra-test-projects
pyra init my-app

cd my-app
npm install
npm run dev
```

**However**, the config file imports from `pyrajs-cli`:
```ts
import { defineConfig } from 'pyrajs-cli';
```

This import will fail unless `pyrajs-cli` is available in `node_modules`.

### Option 2: Link in Test Project

Link the local version in your test project:

```bash
cd /c/web_development/pyra-test-projects/my-app

# Link to local development version
npm link pyrajs-cli

# Now the import and command both use local version
npm run dev
```

### Option 3: Install Published Version (Not Recommended for Development)

```bash
# This installs the OLD published version from npm
npm install -D pyrajs-cli

# You'll get the "Dynamic require of 'events'" error
# because the published version has old bundled code
```

## Development Workflow

### Making Changes

```bash
# 1. Edit source files
vim /c/web_development/projects/Pyrajs/packages/cli/src/bin.ts

# 2. Rebuild (updates the linked version automatically)
cd /c/web_development/projects/Pyrajs
pnpm build

# 3. Test immediately - changes are live!
cd /c/web_development/pyra-test-projects/my-app
npm run dev
```

### Rebuilding

Every time you change source code:

```bash
cd /c/web_development/projects/Pyrajs
pnpm build
```

The global symlink means your changes are **immediately available** - no need to re-link!

## Troubleshooting

### Issue: "Dynamic require of 'events' is not supported"

**Cause:** You're using the published npm version (0.0.3), not the local version.

**Solution:**

```bash
# Re-link globally
cd /c/web_development/projects/Pyrajs
pnpm dev:unlink
pnpm dev:link

# Link in test project
cd /c/web_development/pyra-test-projects/my-app
npm uninstall pyrajs-cli
npm link pyrajs-cli
```

### Issue: "Cannot find package 'pyrajs-cli'"

**Cause:** The config file can't resolve the import.

**Solution:**

```bash
# Link in the test project
cd /c/web_development/pyra-test-projects/my-app
npm link pyrajs-cli
```

### Issue: Changes not reflected

**Cause:** Forgot to rebuild after making changes.

**Solution:**

```bash
cd /c/web_development/projects/Pyrajs
pnpm build
```

### Issue: pnpm link creates a copy, not a symlink

**Cause:** Windows pnpm behavior.

**Solution:** Use `npm link` instead:

```bash
cd /c/web_development/projects/Pyrajs/packages/cli
npm unlink -g
npm link
```

## Understanding the Linking

```
┌─────────────────────────────────────────────┐
│  Global npm directory                        │
│  /c/Users/YOU/AppData/Roaming/npm/          │
│                                              │
│  node_modules/                               │
│  └─ pyrajs-cli → (symlink)                  │
│                                              │
└─────────────────┬────────────────────────────┘
                  │
                  │ points to
                  ↓
┌─────────────────────────────────────────────┐
│  Your local development directory            │
│  /c/web_development/projects/Pyrajs/        │
│                                              │
│  packages/cli/                               │
│  ├─ dist/                                    │
│  │  └─ bin.js (built from src/bin.ts)       │
│  └─ src/                                     │
│     └─ bin.ts (your edits here!)            │
└──────────────────────────────────────────────┘
```

When you run `pyra`, it executes the `bin.js` file in your local directory.

When you run `pnpm build`, it rebuilds `bin.js` from your source code.

## Quick Reference

```bash
# Initial setup (once)
cd /c/web_development/projects/Pyrajs
pnpm dev:link

# Every time you make changes
pnpm build

# Create test project
cd /c/web_development/pyra-test-projects
pyra init my-app
cd my-app
npm link pyrajs-cli  # Link local version for imports
npm install          # Install other dependencies
npm run dev          # Test!

# When done developing
cd /c/web_development/projects/Pyrajs
pnpm dev:unlink
```

## Notes

- The **global `pyra` command** uses the linked version automatically
- The **config file import** needs `npm link pyrajs-cli` in the test project
- **Always rebuild** after making changes (`pnpm build`)
- **npm link** creates proper symlinks on Windows (pnpm link may not)
