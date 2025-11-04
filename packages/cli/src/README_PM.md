# Package Manager Detection (pm.ts)

Automatic package manager detection utility for Pyra CLI.

## Overview

The `pm.ts` module automatically detects which package manager (npm, pnpm, yarn, or bun) a user prefers when scaffolding new projects or running commands.

## Detection Strategy

The detection follows this priority order:

1. **Manual Override** - Use `--pm` flag if provided
2. **Lockfiles** - Check for existing lockfiles in priority:
   - `pnpm-lock.yaml` → pnpm
   - `yarn.lock` → yarn
   - `bun.lockb` → bun
   - `package-lock.json` → npm
3. **Environment Variable** - Parse `npm_config_user_agent`
   - Format: `"pnpm/9.1.0 npm/? node/v20.0.0 linux x64"`
4. **PATH Executables** - Check which package managers are installed
5. **Fallback** - Default to npm

## Usage

### Basic Detection

```typescript
import { detectPM } from './pm.js';

// Detect package manager in current directory
const pm = await detectPM(process.cwd());

console.log(pm.name);        // "pnpm"
console.log(pm.version);     // "9.1.0"
console.log(pm.installCmd);  // "pnpm install"
console.log(pm.runCmd);      // "pnpm run"
console.log(pm.dlxCmd);      // "pnpm dlx"
```

### With Override

```typescript
// Force usage of a specific package manager
const pm = await detectPM(process.cwd(), 'yarn');
```

### Running Commands

```typescript
import { detectPM, spawnPM } from './pm.js';

const pm = await detectPM(process.cwd());

// Install dependencies
await spawnPM(pm, ['install'], { cwd: '/path/to/project' });

// Install with flags
await spawnPM(pm, ['install', '--frozen-lockfile'], { cwd: '/path/to/project' });

// Run scripts
await spawnPM(pm, ['run', 'dev'], { cwd: '/path/to/project' });
```

## API

### `detectPM(cwd: string, override?: PMName): Promise<PM>`

Detects the user's preferred package manager.

**Parameters:**

- `cwd` - Directory to check for lockfiles
- `override` - Force a specific package manager (`'npm' | 'pnpm' | 'yarn' | 'bun'`)

**Returns:** Promise resolving to a `PM` object

### `spawnPM(pm: PM, args: string[], opts: { cwd: string }): Promise<void>`

Spawns the package manager with given arguments.

**Parameters:**

- `pm` - Package manager object from `detectPM()`
- `args` - Command arguments (e.g., `['install', '--frozen-lockfile']`)
- `opts.cwd` - Working directory for the command

**Returns:** Promise that resolves when command completes, rejects on error

## PM Object Structure

```typescript
type PM = {
  name: "npm" | "pnpm" | "yarn" | "bun";
  version?: string;           // e.g., "9.1.0"
  installCmd: string;         // e.g., "pnpm install"
  runCmd: string;             // e.g., "pnpm run"
  dlxCmd?: string;            // e.g., "pnpm dlx" or "npx"
  execCmd?: string;           // e.g., "pnpm exec"
};
```

### Command Examples by Package Manager

| PM | installCmd | runCmd | dlxCmd | execCmd |
|---|---|---|---|---|
| **pnpm** | `pnpm install` | `pnpm run` | `pnpm dlx` | `pnpm exec` |
| **yarn** (v1) | `yarn install` | `yarn run` | - | - |
| **yarn** (v2+) | `yarn install` | `yarn run` | `yarn dlx` | `yarn exec` |
| **bun** | `bun install` | `bun run` | `bunx` | `bun exec` |
| **npm** | `npm install` | `npm run` | `npx` | `npx` |

## Yarn Version Detection

The module automatically detects Yarn version:

- **Yarn v1** (Classic): No `dlx` or `exec` support
- **Yarn v2+** (Berry): Includes `dlx` and `exec` commands

## Windows Support

Commands are spawned with `{ shell: true }` to ensure proper Windows compatibility.

## CLI Integration

### Using in Commands

```typescript
import { detectPM } from './pm.js';

program
  .command('create [project-name]')
  .option('--pm <manager>', 'Package manager to use')
  .action(async (projectName, options) => {
    const pm = await detectPM(process.cwd(), options.pm);
    // Use pm...
  });
```

### User Output

The module provides helpful console output:

```bash
[pyra] Detected package manager from lockfile: pnpm 9.1.0
[pyra] (override with --pm <npm|pnpm|yarn|bun>)
```

## Examples

### Example 1: Auto-install Dependencies

```typescript
import { detectPM, spawnPM } from './pm.js';

async function installDeps(projectDir: string) {
  const pm = await detectPM(projectDir);

  console.log(`Installing with ${pm.name}...`);
  await spawnPM(pm, ['install'], { cwd: projectDir });
  console.log('✓ Dependencies installed');
}
```

### Example 2: Detect from User's Environment

```typescript
// If user runs: pnpm create my-app
// npm_config_user_agent = "pnpm/9.1.0 npm/? node/v20.0.0"

const pm = await detectPM(process.cwd());
// → { name: 'pnpm', version: '9.1.0', ... }
```

### Example 3: Force Specific Package Manager

```typescript
// User runs: pyra create my-app --pm bun

const pm = await detectPM(process.cwd(), 'bun');
// → { name: 'bun', version: '1.0.0', ... }
```

## Error Handling

```typescript
try {
  const pm = await detectPM(process.cwd());
  await spawnPM(pm, ['install'], { cwd: projectDir });
} catch (error) {
  console.error('Failed to install dependencies:', error.message);
  // Fallback or provide manual instructions
}
```

## Testing

The module handles edge cases:

- No lockfiles present
- No package managers installed (fallback to npm)
- Invalid user agent format
- Command execution failures
- Windows vs Unix path differences
