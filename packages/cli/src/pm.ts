/**
 * Package Manager Detection Utility
 *
 * Detects the user's preferred package manager (npm, pnpm, yarn, bun)
 * by checking lockfiles, environment variables, and PATH executables.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { log } from 'pyrajs-shared';

export type PMName = 'npm' | 'pnpm' | 'yarn' | 'bun';

export type PM = {
  /** Package manager name */
  name: PMName;
  /** Version string (e.g., "9.1.0") */
  version?: string;
  /** Install command (e.g., "pnpm install") */
  installCmd: string;
  /** Run script command (e.g., "pnpm run") */
  runCmd: string;
  /** Execute package command (e.g., "pnpm dlx" or "npx") */
  dlxCmd?: string;
  /** Execute command (e.g., "pnpm exec") */
  execCmd?: string;
};

/**
 * Lockfile mappings for each package manager
 */
const LOCKFILES: Record<PMName, string> = {
  pnpm: 'pnpm-lock.yaml',
  yarn: 'yarn.lock',
  bun: 'bun.lockb',
  npm: 'package-lock.json',
};

/**
 * Detect package manager from lockfiles in the given directory
 */
function detectFromLockfile(cwd: string): PMName | null {
  // Priority order: pnpm > yarn > bun > npm
  const order: PMName[] = ['pnpm', 'yarn', 'bun', 'npm'];

  for (const pm of order) {
    const lockfilePath = join(cwd, LOCKFILES[pm]);
    if (existsSync(lockfilePath)) {
      return pm;
    }
  }

  return null;
}

/**
 * Detect package manager from npm_config_user_agent environment variable
 * Format: "pnpm/9.1.0 npm/? node/v20.0.0 linux x64"
 */
function detectFromUserAgent(): { name: PMName; version?: string } | null {
  const userAgent = process.env.npm_config_user_agent;
  if (!userAgent) return null;

  // Extract package manager name and version from user agent
  const pmMatch = userAgent.match(/^(pnpm|yarn|npm|bun)\/(\S+)/);
  if (!pmMatch) return null;

  const name = pmMatch[1] as PMName;
  const version = pmMatch[2] !== '?' ? pmMatch[2] : undefined;

  return { name, version };
}

/**
 * Check if a command exists on PATH
 */
async function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      stdio: 'ignore',
      shell: true,
    });

    child.on('close', (code) => {
      resolve(code === 0);
    });

    child.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Detect package manager from available executables on PATH
 */
async function detectFromPath(): Promise<PMName | null> {
  // Priority order: pnpm > yarn > bun > npm
  const order: PMName[] = ['pnpm', 'yarn', 'bun', 'npm'];

  for (const pm of order) {
    if (await commandExists(pm)) {
      return pm;
    }
  }

  return null;
}

/**
 * Get version of a package manager
 */
async function getVersion(pmName: PMName): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn(pmName, ['--version'], {
      stdio: 'pipe',
      shell: true,
    });

    let output = '';

    child.stdout?.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        // Extract version number (first line, trim whitespace)
        const version = output.trim().split('\n')[0].trim();
        resolve(version);
      } else {
        resolve(undefined);
      }
    });

    child.on('error', () => {
      resolve(undefined);
    });
  });
}

/**
 * Check if Yarn is v2+ (Berry)
 * Yarn v1: 1.x.x
 * Yarn v2+: 2.x.x, 3.x.x, 4.x.x, etc.
 */
function isYarnBerry(version?: string): boolean {
  if (!version) return false;
  const major = parseInt(version.split('.')[0], 10);
  return major >= 2;
}

/**
 * Build PM object with commands based on package manager name and version
 */
function buildPM(name: PMName, version?: string): PM {
  const base = { name, version };

  switch (name) {
    case 'pnpm':
      return {
        ...base,
        installCmd: 'pnpm install',
        runCmd: 'pnpm run',
        dlxCmd: 'pnpm dlx',
        execCmd: 'pnpm exec',
      };

    case 'yarn':
      // Yarn v2+ (Berry) has dlx, Yarn v1 does not
      const isBerry = isYarnBerry(version);
      return {
        ...base,
        installCmd: 'yarn install',
        runCmd: 'yarn run',
        dlxCmd: isBerry ? 'yarn dlx' : undefined,
        execCmd: isBerry ? 'yarn exec' : undefined,
      };

    case 'bun':
      return {
        ...base,
        installCmd: 'bun install',
        runCmd: 'bun run',
        dlxCmd: 'bunx',
        execCmd: 'bun exec',
      };

    case 'npm':
    default:
      return {
        ...base,
        installCmd: 'npm install',
        runCmd: 'npm run',
        dlxCmd: 'npx',
        execCmd: 'npx',
      };
  }
}

/**
 * Detect the user's preferred package manager
 *
 * Detection order:
 * 1. Use override if provided
 * 2. Check for lockfiles in cwd
 * 3. Check npm_config_user_agent environment variable
 * 4. Check available executables on PATH
 * 5. Fallback to npm
 *
 * @param cwd - Current working directory to check for lockfiles
 * @param override - Force a specific package manager
 * @returns PM object with name, version, and commands
 */
export async function detectPM(
  cwd: string,
  override?: PMName
): Promise<PM> {
  let detectedName: PMName;
  let detectedVersion: string | undefined;

  // 1. Use override if provided
  if (override) {
    detectedName = override;
    detectedVersion = await getVersion(override);
    log.info(`Using package manager override: ${override}`);
  }
  // 2. Check lockfiles
  else {
    const lockfileResult = detectFromLockfile(cwd);
    if (lockfileResult) {
      detectedName = lockfileResult;
      detectedVersion = await getVersion(lockfileResult);
      const versionStr = detectedVersion ? ` ${detectedVersion}` : '';
      log.info(`Detected package manager from lockfile: ${detectedName}${versionStr}`);
    }
    // 3. Check user agent
    else {
      const userAgentResult = detectFromUserAgent();
      if (userAgentResult) {
        detectedName = userAgentResult.name;
        detectedVersion = userAgentResult.version;
        const versionStr = detectedVersion ? ` ${detectedVersion}` : '';
        log.info(`Detected package manager from environment: ${detectedName}${versionStr}`);
      }
      // 4. Check PATH
      else {
        const pathResult = await detectFromPath();
        if (pathResult) {
          detectedName = pathResult;
          detectedVersion = await getVersion(pathResult);
          const versionStr = detectedVersion ? ` ${detectedVersion}` : '';
          log.info(`Detected package manager from PATH: ${detectedName}${versionStr}`);
        }
        // 5. Fallback to npm
        else {
          detectedName = 'npm';
          detectedVersion = await getVersion('npm');
          log.warn('No package manager detected, falling back to npm');
        }
      }
    }
  }

  const pm = buildPM(detectedName, detectedVersion);

  // Show hint about override
  if (!override) {
    log.info('(override with --pm <npm|pnpm|yarn|bun>)');
  }

  return pm;
}

/**
 * Spawn a package manager command with the given arguments
 *
 * @param pm - Package manager object from detectPM
 * @param args - Command arguments (e.g., ['install', '--frozen-lockfile'])
 * @param opts - Spawn options (must include cwd)
 * @returns Promise that resolves when the command completes
 */
export async function spawnPM(
  pm: PM,
  args: string[],
  opts: { cwd: string }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(pm.name, args, {
      cwd: opts.cwd,
      stdio: 'inherit', // Pipe output to parent process
      shell: true, // Required for Windows compatibility
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${pm.name} exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to spawn ${pm.name}: ${error.message}`));
    });
  });
}
