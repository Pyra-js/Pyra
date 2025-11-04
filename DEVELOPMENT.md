# Development Guide

This guide explains how to develop Pyra.js and test your changes in external projects.

## Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/Simpleboi/Pyra.git
cd Pyra
pnpm install

# 2. Build all packages
pnpm build

# 3. Link CLI globally for testing
pnpm dev:link
```

## Development Workflow

### Making Changes

When you make changes to any source files:

```bash
# From the monorepo root
cd /c/web_development/projects/Pyrajs

# Build all packages (recommended)
pnpm build

# OR build only specific packages
cd packages/shared && pnpm build  # If you changed shared
cd packages/core && pnpm build    # If you changed core
cd packages/cli && pnpm build     # If you changed CLI
```

### Testing Changes Globally

After building, your changes are immediately available globally (if linked):

```bash
# Create a test project anywhere
cd /c/web_development/pyra-test-projects
pyra create my-test-app
cd my-test-app

# Install dependencies
npm install

# Test your changes
npm run dev
```

### Quick Rebuild Cycle

The fastest way to iterate:

```bash
# Terminal 1: Watch and rebuild on changes
cd /c/web_development/projects/Pyrajs
pnpm build  # Rebuild after each change

# Terminal 2: Test in your project
cd /c/web_development/pyra-test-projects/my-test-app
npm run dev
```

## Available Scripts

From the monorepo root:

```bash
# Build all packages
pnpm build

# Build and link CLI globally
pnpm dev:link

# Unlink CLI from global
pnpm dev:unlink

# Type-check all packages
pnpm typecheck

# Clean build artifacts
pnpm clean
```

## Package-Specific Scripts

### CLI Package (`packages/cli/`)

```bash
cd packages/cli

# Build the CLI
pnpm build

# Run CLI without building (dev mode)
pnpm dev:run

# Build and link globally
pnpm dev:link
```

### Core Package (`packages/core/`)

```bash
cd packages/core

# Build once
pnpm build

# Watch mode (rebuild on changes)
pnpm dev
```

### Shared Package (`packages/shared/`)

```bash
cd packages/shared

# Build the shared utilities
pnpm build
```

## Build Order

When building manually, respect the dependency order:

1. **shared** - No dependencies
2. **core** - Depends on shared
3. **cli** - Depends on core and shared

```bash
# Manual build in order
cd packages/shared && pnpm build
cd ../core && pnpm build
cd ../cli && pnpm build
```

Or just use `pnpm build` from root - it handles the order automatically!

## Testing Your Changes

### 1. Unit Tests (Not yet implemented)

```bash
pnpm test
```

### 2. Manual Testing

Create a test project:

```bash
# Use the globally linked CLI
pyra create test-app
cd test-app
npm install
npm run dev
```

### 3. Testing Specific Features

```bash
# Test dev server
pyra dev

# Test with custom port
pyra dev -p 8080

# Test build command
pyra build

# Test help
pyra --help
```

## Common Issues

### Issue: Changes not reflected globally

**Solution:** Make sure you've built and linked:

```bash
cd /c/web_development/projects/Pyrajs
pnpm build
pnpm dev:link
```

### Issue: "Cannot find module 'pyrajs-cli'"

**Solution:** Rebuild all packages:

```bash
cd /c/web_development/projects/Pyrajs
pnpm install
pnpm build
```

### Issue: Test project has old package names

**Solution:** Update `pyra.config.js` in your test project:

```js
// Change from:
import { defineConfig } from '@pyra/cli';  // ❌

// Change to:
import { defineConfig } from 'pyrajs-cli';  // ✅
```

Or recreate the test project with `pyra create new-app`.

## Unlinking

When you're done developing and want to use the published version:

```bash
# Unlink the global CLI
pnpm dev:unlink

# Or manually:
cd packages/cli
pnpm unlink --global
```

## Publishing Workflow

When ready to publish:

```bash
# 1. Build all packages
pnpm build

# 2. Update versions
cd packages/shared && npm version patch
cd ../core && npm version patch
cd ../cli && npm version patch

# 3. Publish in order
cd packages/shared && npm publish
cd ../core && npm publish
cd ../cli && npm publish
```

## Tips

- **Always rebuild** after making changes to source files
- **Build order matters** - shared → core → cli
- **Use `pnpm build`** from root to avoid ordering issues
- **Link once** - you only need to link once, rebuilds update automatically
- **Test in isolation** - create fresh test projects to verify everything works
