import * as esbuild from 'esbuild';
import { log } from '@pyra/shared';
import path from 'node:path';

/**
 * In-memory cache for bundled modules
 */
const bundleCache = new Map<string, { code: string; timestamp: number }>();

/**
 * Cache duration in milliseconds (5 seconds)
 */
const CACHE_DURATION = 5000;

/**
 * Bundle a file with all its dependencies using esbuild
 * This resolves imports from node_modules and bundles everything together
 */
export async function bundleFile(
  filePath: string,
  root: string = process.cwd()
): Promise<string> {
  const ext = path.extname(filePath);

  // Only bundle JS/TS files
  if (!/\.(tsx?|jsx?|mjs)$/.test(ext)) {
    throw new Error(`Cannot bundle file type: ${ext}`);
  }

  // Check cache
  const cached = bundleCache.get(filePath);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.code;
  }

  try {
    // Use esbuild's build API with write: false to get output in memory
    const result = await esbuild.build({
      entryPoints: [filePath],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'es2020',
      platform: 'browser',
      sourcemap: 'inline',
      loader: {
        '.ts': 'ts',
        '.tsx': 'tsx',
        '.jsx': 'jsx',
        '.js': 'js',
      },
      logLevel: 'silent',
      absWorkingDir: root,
      // External packages can be configured here if needed
      // external: [],
    });

    if (result.outputFiles && result.outputFiles.length > 0) {
      const code = result.outputFiles[0].text;

      // Cache the result
      bundleCache.set(filePath, {
        code,
        timestamp: Date.now(),
      });

      return code;
    }

    throw new Error('No output generated from bundler');

  } catch (error) {
    if (error instanceof Error) {
      log.error(`Failed to bundle ${filePath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Clear the bundle cache (useful for HMR)
 */
export function clearBundleCache(filePath?: string): void {
  if (filePath) {
    bundleCache.delete(filePath);
    log.info(`Cleared cache for ${filePath}`);
  } else {
    bundleCache.clear();
    log.info('Cleared all bundle cache');
  }
}

/**
 * Clear cache entries for any file that depends on the changed file
 * For now, we'll just clear everything to be safe
 */
export function invalidateDependentCache(changedFile: string): void {
  // Simple strategy: clear all cache on any change
  // TODO: Build a dependency graph for more granular invalidation
  bundleCache.clear();
  log.info(`Cache invalidated due to change in ${changedFile}`);
}
