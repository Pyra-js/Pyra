# Reporter Utility

The reporter utility provides polished banner and timing output for Pyra CLI commands, similar to Vite's style.

## Features

- ✨ Clean, modern formatting with subtle colors
- ⏱️ High-precision timing using `performance.now()`
- 🎨 Automatic color detection (TTY-aware)
- 🤫 Silent mode support via `--silent` flag or `PYRA_SILENT=1`
- 🎯 Smart formatting (ms vs s)

## Output Examples

### With Color (TTY)

```bash
$ pyra create my-app
pyra v0.0.3

[pyra] Creating new Pyra project: my-app
...
[pyra] Project scaffolded successfully!

project completed in 1.27 s
```

```bash
$ pyra build
pyra v0.0.3

[pyra] Building...
[pyra] Build complete!

project built in 842 ms
```

### Without Color (CI/Non-TTY)

```
pyra v0.0.3
project built in 234 ms
```

## Usage in Commands

Each command integrates the reporter like this:

```typescript
import { startTimer, printBanner, printDone, isSilent, useColor } from './utils/reporter.js';

program
  .command('build')
  .option('--silent', 'Suppress banner and timing output')
  .action(async (options) => {
    const silent = isSilent(process.argv, process.env);
    const color = useColor(process.argv, process.env);

    // Print banner
    if (!silent) {
      printBanner({ silent, color });
      console.log('');
    }

    const stop = startTimer();

    try {
      // ... do work ...

      // Print completion message
      if (!silent) {
        console.log('');
        printDone({ verb: 'built', elapsedMs: stop(), silent, color });
      }
    } catch (error) {
      // Don't print "done" on error
      log.error(`Build failed: ${error}`);
      process.exit(1);
    }
  });
```

## Disabling Output

### Via Flag

```bash
$ pyra build --silent
# No banner or timing output
```

### Via Environment Variable

```bash
$ PYRA_SILENT=1 pyra build
# No banner or timing output
```

### Disable Colors

```bash
$ pyra build --no-color
# Plain text output

$ NO_COLOR=1 pyra build
# Plain text output (standard convention)
```

## API Reference

### `startTimer(): () => number`

Start a high-precision timer. Returns a function that returns elapsed milliseconds.

```typescript
const stop = startTimer();
// ... do work ...
const elapsed = stop(); // Returns ms
```

### `printBanner(opts)`

Print the package name and version banner.

```typescript
printBanner({
  name: 'pyra',        // Optional, defaults to 'pyra'
  version: '0.0.3',    // Optional, auto-detected from package.json
  color: true,         // Optional, defaults to true
  silent: false        // Optional, defaults to false
});
```

### `printDone(opts)`

Print completion message with elapsed time.

```typescript
printDone({
  verb: 'built',       // 'built' | 'completed'
  elapsedMs: 1234.56,  // Elapsed milliseconds
  color: true,         // Optional, defaults to true
  silent: false        // Optional, defaults to false
});
```

### `isSilent(argv, env): boolean`

Check if silent mode is enabled.

```typescript
const silent = isSilent(process.argv, process.env);
// Returns true if --silent flag or PYRA_SILENT=1
```

### `useColor(argv, env): boolean`

Check if colors should be used.

```typescript
const color = useColor(process.argv, process.env);
// Returns false if --no-color or NO_COLOR env var is set
```

## Duration Formatting

The reporter automatically formats durations:

- **< 1,000 ms** → `123 ms`
- **≥ 1,000 ms** → `1.23 s`

Examples:
- `234 ms` → `234 ms`
- `1234 ms` → `1.23 s`
- `5678 ms` → `5.68 s`

## Version Resolution

The version is automatically read from the CLI's `package.json`:

1. Resolves relative to the reporter module using `import.meta.url`
2. Falls back to `"?"` if package.json can't be read
3. Works correctly in both development (monorepo) and published package scenarios

## Edge Cases

### No Double-Printing

Only the top-level command prints the banner and timing. If a command calls shared helpers (like `initProject`), those helpers don't print their own banner/timing.

### Error Handling

If a command throws an error, the "completed/built" message is **not** printed. This prevents obscuring error messages.

```typescript
try {
  // ... work ...
  printDone({ ... }); // Only called on success
} catch (error) {
  // Error handling, no "done" message
  log.error(`Failed: ${error}`);
  process.exit(1);
}
```

### CI/Non-TTY

The reporter gracefully degrades in CI environments:
- Detects TTY availability via `picocolors.isColorSupported`
- Respects standard environment variables (`NO_COLOR`, `FORCE_COLOR`)
- No extra blank lines when colors are disabled

## Implementation Notes

- Uses `performance.now()` from `node:perf_hooks` for high-precision timing
- Minimal dependencies (only `picocolors` for color handling)
- ESM-only (uses `import.meta.url` for path resolution)
- Monorepo-safe version detection
