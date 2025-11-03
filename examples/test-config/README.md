# Pyra Config Test

This is a demo project showing how users actually use Pyra configuration.

## What's Happening

1. **`pyra.config.ts`** - Configuration file in the project root
2. **Auto-discovery** - Pyra automatically finds and loads it
3. **Type safety** - `defineConfig` provides full IntelliSense
4. **CLI integration** - Config values are used by `pyra dev` and `pyra build`

## Try It

```bash
# Pyra will:
# 1. Look for pyra.config.ts in this directory
# 2. Load the configuration
# 3. Apply the settings (port 8080, output to 'build/', etc.)
pyra dev

# Override config with CLI flag
pyra dev --port 9000

# Build with config
pyra build
```

## Configuration Flow

```
User creates pyra.config.ts
         ↓
User runs: pyra dev
         ↓
CLI loads config with loadConfig()
         ↓
Config is merged with defaults
         ↓
CLI flags override config values
         ↓
Final config is passed to DevServer/Builder
```

## Key Features Demonstrated

✅ **Auto-discovery** - No need to specify config path
✅ **TypeScript** - Full type checking with `defineConfig`
✅ **Path aliases** - `@` maps to `./src`
✅ **Server config** - Port, HMR, CORS settings
✅ **Build config** - Sourcemaps, minification, target
✅ **CLI overrides** - Command-line flags take precedence

## What Users See

When running `pyra dev`:

```
[INFO] Loading config from C:\path\to\pyra.config.ts
[INFO] Starting dev server in development mode...
[INFO] Dev server running at http://localhost:8080
```

The config file is automatically discovered and loaded!
