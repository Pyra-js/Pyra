/**
 * Lockfile parsing for resolved versions (best-effort)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LockfileInfo } from './types.js';

/**
 * Detect and parse lockfile
 */
export function parseLockfile(rootPath: string): LockfileInfo {
  // Try pnpm-lock.yaml
  const pnpmLockPath = join(rootPath, 'pnpm-lock.yaml');
  if (existsSync(pnpmLockPath)) {
    return parsePnpmLock(pnpmLockPath);
  }

  // Try yarn.lock
  const yarnLockPath = join(rootPath, 'yarn.lock');
  if (existsSync(yarnLockPath)) {
    return parseYarnLock(yarnLockPath);
  }

  // Try package-lock.json
  const npmLockPath = join(rootPath, 'package-lock.json');
  if (existsSync(npmLockPath)) {
    return parseNpmLock(npmLockPath);
  }

  // Try bun.lockb (binary format, skip for now)
  const bunLockPath = join(rootPath, 'bun.lockb');
  if (existsSync(bunLockPath)) {
    return {
      type: 'bun',
      path: bunLockPath,
      resolvedVersions: new Map(),
    };
  }

  return {
    type: 'none',
    resolvedVersions: new Map(),
  };
}

/**
 * Parse pnpm-lock.yaml (YAML parsing with regex - best effort)
 */
function parsePnpmLock(lockPath: string): LockfileInfo {
  const resolvedVersions = new Map<string, string>();

  try {
    const content = readFileSync(lockPath, 'utf-8');

    // Match package entries like:
    // /@scope/package@1.2.3:
    // /package@1.2.3:
    const packageRegex = /^\s*['"]?\/(@?[^@\s]+)@([^:'"]+)['"]?:/gm;
    let match;

    while ((match = packageRegex.exec(content)) !== null) {
      const packageName = match[1];
      const version = match[2];

      // Store the resolved version
      if (!resolvedVersions.has(packageName)) {
        resolvedVersions.set(packageName, version);
      }
    }
  } catch (error) {
    // Best effort - if parsing fails, return empty map
  }

  return {
    type: 'pnpm',
    path: lockPath,
    resolvedVersions,
  };
}

/**
 * Parse yarn.lock (simple regex parsing - best effort)
 */
function parseYarnLock(lockPath: string): LockfileInfo {
  const resolvedVersions = new Map<string, string>();

  try {
    const content = readFileSync(lockPath, 'utf-8');

    // Match entries like:
    // package@^1.0.0:
    //   version "1.2.3"
    const lines = content.split('\n');
    let currentPackage: string | null = null;

    for (const line of lines) {
      // Package name line
      const pkgMatch = line.match(/^"?([^@\s]+)@/);
      if (pkgMatch) {
        currentPackage = pkgMatch[1];
        continue;
      }

      // Version line
      if (currentPackage) {
        const versionMatch = line.match(/^\s+version\s+"([^"]+)"/);
        if (versionMatch) {
          if (!resolvedVersions.has(currentPackage)) {
            resolvedVersions.set(currentPackage, versionMatch[1]);
          }
          currentPackage = null;
        }
      }
    }
  } catch (error) {
    // Best effort
  }

  return {
    type: 'yarn',
    path: lockPath,
    resolvedVersions,
  };
}

/**
 * Parse package-lock.json
 */
function parseNpmLock(lockPath: string): LockfileInfo {
  const resolvedVersions = new Map<string, string>();

  try {
    const content = readFileSync(lockPath, 'utf-8');
    const lock = JSON.parse(content);

    // npm v1/v2 format
    if (lock.dependencies) {
      for (const [name, info] of Object.entries<any>(lock.dependencies)) {
        if (info.version) {
          resolvedVersions.set(name, info.version);
        }
      }
    }

    // npm v3 format
    if (lock.packages) {
      for (const [pkgPath, info] of Object.entries<any>(lock.packages)) {
        if (!pkgPath || pkgPath === '') continue;

        // Extract package name from node_modules path
        const match = pkgPath.match(/node_modules\/(@?[^/]+(?:\/[^/]+)?)/);
        if (match && info.version) {
          const name = match[1];
          if (!resolvedVersions.has(name)) {
            resolvedVersions.set(name, info.version);
          }
        }
      }
    }
  } catch (error) {
    // Best effort
  }

  return {
    type: 'npm',
    path: lockPath,
    resolvedVersions,
  };
}

/**
 * Enrich graph edges with resolved versions from lockfile
 */
export function enrichGraphWithLockfile(
  graph: { edges: Array<{ to: string; resolvedVersion?: string }> },
  lockfile: LockfileInfo
): void {
  for (const edge of graph.edges) {
    if (!edge.resolvedVersion && lockfile.resolvedVersions.has(edge.to)) {
      edge.resolvedVersion = lockfile.resolvedVersions.get(edge.to);
    }
  }
}
