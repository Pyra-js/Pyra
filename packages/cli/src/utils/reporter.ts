import { performance } from 'node:perf_hooks';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pc from 'picocolors';

/**
 * Start a high-precision timer. Returns a function that returns elapsed milliseconds.
 */
export function startTimer(): () => number {
  const start = performance.now();
  return () => performance.now() - start;
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Get package version from CLI's package.json
 */
function getVersion(): string {
  try {
    // Get the current file's directory
    const currentDir = dirname(fileURLToPath(import.meta.url));

    // Try multiple possible locations for package.json
    const possiblePaths = [
      // When built: dist/utils/reporter.js -> ../../package.json
      join(currentDir, '../../package.json'),
      // When in src: src/utils/reporter.ts -> ../../package.json
      join(currentDir, '../../package.json'),
      // When globally linked via npm link: might be in node_modules/pyrajs-cli
      join(currentDir, '../../../package.json'),
    ];

    for (const pkgPath of possiblePaths) {
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
          // Make sure we're reading the right package.json (CLI package)
          if (pkg.name === 'pyrajs-cli' && pkg.version) {
            return pkg.version;
          }
        } catch {
          // Try next path
          continue;
        }
      }
    }

    return '?';
  } catch {
    return '?';
  }
}

/**
 * Check if silent mode is enabled via flag or environment variable
 */
export function isSilent(argv: string[], env: NodeJS.ProcessEnv): boolean {
  return argv.includes('--silent') || env.PYRA_SILENT === '1';
}

/**
 * Check if colors should be used
 */
export function useColor(argv: string[], env: NodeJS.ProcessEnv): boolean {
  // Respect --no-color flag
  if (argv.includes('--no-color')) {
    return false;
  }

  // Check if NO_COLOR env var is set (standard)
  if (env.NO_COLOR !== undefined) {
    return false;
  }

  // Check if FORCE_COLOR is set
  if (env.FORCE_COLOR !== undefined) {
    return true;
  }

  // Default to picocolors' detection (checks TTY)
  return pc.isColorSupported;
}

/**
 * Print the banner with package name and version
 */
export function printBanner(opts: {
  name?: string;
  version?: string;
  color?: boolean;
  silent?: boolean;
}): void {
  if (opts.silent) return;

  const name = opts.name || 'pyra';
  const version = opts.version || getVersion();
  const color = opts.color ?? true;

  if (color) {
    console.log(`${pc.bold(name)} ${pc.dim(`v${version}`)}`);
  } else {
    console.log(`${name} v${version}`);
  }
}

/**
 * Print completion message with elapsed time
 */
export function printDone(opts: {
  verb: 'built' | 'completed';
  elapsedMs: number;
  color?: boolean;
  silent?: boolean;
}): void {
  if (opts.silent) return;

  const duration = formatDuration(opts.elapsedMs);
  const message = `project ${opts.verb} in ${duration}`;
  const color = opts.color ?? true;

  if (color) {
    console.log(pc.dim(message));
  } else {
    console.log(message);
  }
}

/**
 * Helper to wrap a command with banner and timing
 */
export async function withBanner<T>(
  fn: () => Promise<T>,
  opts: {
    verb?: 'built' | 'completed';
    argv?: string[];
    env?: NodeJS.ProcessEnv;
  } = {}
): Promise<T> {
  const argv = opts.argv || process.argv;
  const env = opts.env || process.env;
  const verb = opts.verb || 'completed';

  const silent = isSilent(argv, env);
  const color = useColor(argv, env);

  // Print banner
  printBanner({ silent, color });

  // Start timer
  const stop = startTimer();

  try {
    // Execute the command
    const result = await fn();

    // Print success message
    printDone({ verb, elapsedMs: stop(), silent, color });

    return result;
  } catch (error) {
    // Don't print "done" on error, just rethrow
    throw error;
  }
}
