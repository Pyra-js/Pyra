/**
 * Workspace detection for monorepos
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { WorkspaceInfo, PackageJsonInfo } from './types.js';
import { log } from 'pyrajs-shared';

/**
 * Detect workspaces in a monorepo
 */
export function detectWorkspaces(rootPath: string): WorkspaceInfo[] {
  const workspaces: WorkspaceInfo[] = [];

  // Read root package.json
  const rootPkgPath = join(rootPath, 'package.json');
  if (!existsSync(rootPkgPath)) {
    throw new Error(`No package.json found at ${rootPath}`);
  }

  const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'));

  // Check for workspaces in package.json (npm/yarn/pnpm)
  let workspacePatterns: string[] = [];

  if (rootPkg.workspaces) {
    if (Array.isArray(rootPkg.workspaces)) {
      workspacePatterns = rootPkg.workspaces;
    } else if (rootPkg.workspaces.packages) {
      workspacePatterns = rootPkg.workspaces.packages;
    }
  }

  // Check pnpm-workspace.yaml
  const pnpmWorkspacePath = join(rootPath, 'pnpm-workspace.yaml');
  if (existsSync(pnpmWorkspacePath)) {
    const yaml = readFileSync(pnpmWorkspacePath, 'utf-8');
    const match = yaml.match(/packages:\s*\n((?:\s*-\s*.+\n?)+)/);
    if (match) {
      const patterns = match[1]
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('-'))
        .map(line => line.substring(1).trim())
        .filter(Boolean);
      workspacePatterns.push(...patterns);
    }
  }

  // If no workspaces found, treat as single package
  if (workspacePatterns.length === 0) {
    const pkgInfo = parsePackageJson(rootPkg);
    if (pkgInfo) {
      workspaces.push({
        name: pkgInfo.name,
        path: rootPath,
        packageJson: pkgInfo,
      });
    }
    return workspaces;
  }

  // Find all workspace packages
  const packagePaths = new Set<string>();

  for (const pattern of workspacePatterns) {
    // Skip negation patterns for now
    if (pattern.startsWith('!')) continue;

    // Simple glob matching for patterns like "packages/*"
    if (pattern.includes('*')) {
      const baseDir = pattern.split('*')[0];
      const basePath = join(rootPath, baseDir);

      if (!existsSync(basePath)) continue;

      try {
        const entries = readdirSync(basePath);
        for (const entry of entries) {
          const entryPath = join(basePath, entry);
          const pkgPath = join(entryPath, 'package.json');

          if (existsSync(pkgPath)) {
            packagePaths.add(resolve(entryPath));
          }
        }
      } catch (error) {
        // Skip on error
      }
    } else {
      // Direct path
      const pkgPath = join(rootPath, pattern, 'package.json');
      if (existsSync(pkgPath)) {
        packagePaths.add(resolve(join(rootPath, pattern)));
      }
    }
  }

  // Parse each workspace package
  for (const pkgPath of packagePaths) {
    const pkgJsonPath = join(pkgPath, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;

    try {
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      const pkgInfo = parsePackageJson(pkgJson);

      if (pkgInfo) {
        workspaces.push({
          name: pkgInfo.name,
          path: pkgPath,
          packageJson: pkgInfo,
        });
      }
    } catch (error) {
      log.warn(`Failed to parse ${pkgJsonPath}: ${error}`);
    }
  }

  return workspaces;
}

/**
 * Parse package.json into structured info
 */
function parsePackageJson(pkg: any): PackageJsonInfo | null {
  if (!pkg.name) return null;

  return {
    name: pkg.name,
    version: pkg.version || '0.0.0',
    description: pkg.description,
    private: pkg.private === true,
    dependencies: pkg.dependencies || {},
    devDependencies: pkg.devDependencies || {},
    peerDependencies: pkg.peerDependencies || {},
    optionalDependencies: pkg.optionalDependencies || {},
  };
}
