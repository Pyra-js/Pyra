import * as esbuild from 'esbuild';
import { log, type ResolveConfig } from '@pyra-js/shared';
import path from 'node:path';
import { metricsStore } from './metrics.js';
import { createPostCSSPlugin } from './css-plugin.js';

/**
 * Translate Pyra's ResolveConfig into the subset of esbuild BuildOptions that
 * control module resolution: alias, resolveExtensions, and mainFields.
 *
 * Called by both bundleFile() (dev) and the build orchestrator (prod) so the
 * behaviour is identical in both environments.
 */
export function buildEsbuildResolveOptions(
  resolveConfig: ResolveConfig | undefined,
  root: string,
): Pick<esbuild.BuildOptions, 'alias' | 'resolveExtensions' | 'mainFields'> {
  if (!resolveConfig) return {};

  const opts: Pick<esbuild.BuildOptions, 'alias' | 'resolveExtensions' | 'mainFields'> = {};

  // alias: { "@": "./src" } → esbuild needs absolute paths for replacement values.
  // path.resolve(root, value) handles relative paths; path.isAbsolute guards
  // against double-resolving when the user already wrote an absolute path.
  if (resolveConfig.alias) {
    opts.alias = {};
    for (const [key, value] of Object.entries(resolveConfig.alias)) {
      opts.alias[key] = path.isAbsolute(value) ? value : path.resolve(root, value);
    }
  }

  // extensions → resolveExtensions (esbuild's name for the same concept).
  // When esbuild sees `import './Button'` with no extension it tries each in order.
  if (resolveConfig.extensions) {
    opts.resolveExtensions = resolveConfig.extensions;
  }

  // mainFields controls which package.json field esbuild prefers when resolving
  // a node_modules package (e.g. ["module", "main"] prefers ESM over CJS).
  if (resolveConfig.mainFields) {
    opts.mainFields = resolveConfig.mainFields;
  }

  return opts;
}

/**
 * In-memory cache for bundled modules
 */
const bundleCache = new Map<string, { code: string; timestamp: number }>();

/**
 * Separate cache for CSS extracted from bundled modules.
 * Keyed by the same file path as bundleCache.
 * Allows the dev server to serve CSS as <link> tags instead of injecting
 * it into JS (which causes Flash of Unstyled Content).
 */
const cssOutputCache = new Map<string, { css: string; timestamp: number }>();

/**
 * Dependency graph: maps each bundle entry (absolute path) to the full set
 * of source files that were imported — directly or transitively — to produce
 * it.  Built from the esbuild metafile after every successful compile.
 */
const dependencyGraph = new Map<string, Set<string>>();

/**
 * Reverse dependency index: maps each source file (absolute path) to the set
 * of bundle entry paths that depend on it.  Derived from dependencyGraph and
 * kept in sync whenever dependencyGraph is updated.
 *
 * Used by invalidateDependentCache() to evict only the affected entries
 * instead of clearing the whole cache on every file change.
 */
const reverseDependencyIndex = new Map<string, Set<string>>();

/**
 * One PostCSS plugin instance per project root (created lazily on first use).
 */
const postcssPluginCache = new Map<string, esbuild.Plugin>();

function getPostCSSPlugin(root: string): esbuild.Plugin {
  if (!postcssPluginCache.has(root)) {
    postcssPluginCache.set(root, createPostCSSPlugin(root));
  }
  return postcssPluginCache.get(root)!;
}

/**
 * Cache duration in milliseconds (5 seconds)
 */
const CACHE_DURATION = 5000;

/**
 * In-flight compiles: maps a file path to its pending bundleFile promise.
 * Concurrent requests for the same uncached file join this promise rather than
 * each spawning their own esbuild process.
 */
const pendingBundles = new Map<string, Promise<string>>();

/**
 * Bundle a file with all its dependencies using esbuild
 * This resolves imports from node_modules and bundles everything together
 */
export async function bundleFile(
  filePath: string,
  root: string = process.cwd(),
  resolveConfig?: ResolveConfig,
  extraPlugins: esbuild.Plugin[] = [],
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

  // If an identical compile is already in progress, join it instead of
  // spawning a duplicate esbuild process.
  const inflight = pendingBundles.get(filePath);
  if (inflight) return inflight;

  const compile = (async () => {
  try {
    const startTime = Date.now();

    // Use esbuild's build API with write: false to get output in memory
    const result = await esbuild.build({
      entryPoints: [filePath],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'es2020',
      platform: 'browser',
      sourcemap: 'inline',
      metafile: true,
      // Node.js-only packages used by adapter internals (e.g. the React Fast
      // Refresh esbuild plugin) must never be bundled for the browser. Marking
      // them external prevents esbuild from following their import chains and
      // failing on packages like @babel/preset-typescript that aren't installed
      // in every user project.
      // Node.js built-ins (path, fs, module) are also listed here as a defensive
      // fallback: older adapter builds without the "browser" export condition may
      // contain top-level imports of these modules. Externalising them prevents a
      // hard build failure — esbuild's tree-shaker eliminates the dead code paths
      // (e.g. createFastRefreshPlugin) so they never appear in the browser output.
      external: [
        '@babel/core', 'esbuild', 'react-refresh', 'react-refresh/babel',
        'node:path', 'path', 'node:fs', 'node:fs/promises', 'fs', 'fs/promises',
        'node:module', 'module', 'node:url', 'url',
      ],
      plugins: [...extraPlugins, getPostCSSPlugin(root)],
      loader: {
        '.ts': 'ts',
        '.tsx': 'tsx',
        '.jsx': 'jsx',
        '.js': 'js',
        '.css': 'css',
      },
      logLevel: 'silent',
      absWorkingDir: root,
      // Need outdir even with write:false so esbuild knows how to structure CSS output
      outdir: 'dist',
      // Spread alias / resolveExtensions / mainFields from pyra.config resolve field.
      // buildEsbuildResolveOptions returns {} when resolveConfig is undefined so
      // this is always safe to spread.
      ...buildEsbuildResolveOptions(resolveConfig, root),
    });

    if (result.outputFiles && result.outputFiles.length > 0) {
      // esbuild may generate multiple files (e.g., .js and .css)
      // We need to find the JS file and inject any CSS into it
      let jsCode = '';
      let cssCode = '';

      for (const file of result.outputFiles) {
        if (file.path.endsWith('.js')) {
          jsCode = file.text;
        } else if (file.path.endsWith('.css')) {
          cssCode = file.text;
        }
      }

      // If no separate JS file found, use the first output
      if (!jsCode && result.outputFiles.length > 0) {
        jsCode = result.outputFiles[0].text;
      }

      // Store CSS in a separate cache so the dev server can serve it as a
      // <link> stylesheet (avoids Flash of Unstyled Content from JS injection).
      if (cssCode) {
        cssOutputCache.set(filePath, { css: cssCode, timestamp: Date.now() });
      } else {
        cssOutputCache.delete(filePath);
      }
      const code = jsCode;

      const compileTime = Date.now() - startTime;
      const size = Buffer.byteLength(code, 'utf-8');

      // Track metrics
      metricsStore.addFileMetric({
        path: path.relative(root, filePath),
        size,
        compileTime,
        timestamp: Date.now(),
      });

      // Cache the result
      bundleCache.set(filePath, {
        code,
        timestamp: Date.now(),
      });

      // Update dependency graph from esbuild metafile so that
      // invalidateDependentCache() can do targeted eviction instead of
      // clearing the whole cache on every file change.
      if (result.metafile) {
        // Collect the full set of source files that contributed to this entry.
        // esbuild reports paths relative to absWorkingDir (root), so resolve
        // them to absolute paths for consistent comparison with chokidar events.
        const deps = new Set<string>();
        for (const inputPath of Object.keys(result.metafile.inputs)) {
          deps.add(path.isAbsolute(inputPath) ? inputPath : path.resolve(root, inputPath));
        }

        // Remove stale reverse-index entries for this entry before re-registering.
        const oldDeps = dependencyGraph.get(filePath);
        if (oldDeps) {
          for (const dep of oldDeps) {
            reverseDependencyIndex.get(dep)?.delete(filePath);
          }
        }

        // Store the new dependency set and rebuild reverse-index entries.
        dependencyGraph.set(filePath, deps);
        for (const dep of deps) {
          let entries = reverseDependencyIndex.get(dep);
          if (!entries) {
            entries = new Set();
            reverseDependencyIndex.set(dep, entries);
          }
          entries.add(filePath);
        }
      }

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
 * Return the CSS output for a previously bundled file, or null if the file
 * produced no CSS (or has not been bundled yet).
 */
export function getCSSOutput(filePath: string): string | null {
  return cssOutputCache.get(filePath)?.css ?? null;
}

/** Remove a single entry from dependencyGraph + reverseDependencyIndex. */
function evictFromGraph(entryPath: string): void {
  const deps = dependencyGraph.get(entryPath);
  if (!deps) return;
  for (const dep of deps) {
    const entries = reverseDependencyIndex.get(dep);
    if (entries) {
      entries.delete(entryPath);
      if (entries.size === 0) reverseDependencyIndex.delete(dep);
    }
  }
  dependencyGraph.delete(entryPath);
}

/**
 * Clear the bundle cache (useful for HMR)
 */
export function clearBundleCache(filePath?: string): void {
  if (filePath) {
    bundleCache.delete(filePath);
    cssOutputCache.delete(filePath);
    evictFromGraph(filePath);
    log.info(`Cleared cache for ${filePath}`);
  } else {
    bundleCache.clear();
    cssOutputCache.clear();
    dependencyGraph.clear();
    reverseDependencyIndex.clear();
    log.info('Cleared all bundle cache');
  }
}

/**
 * Evict only the bundle entries that transitively imported changedFile.
 *
 * Uses the reverse dependency index built from esbuild metafile data.
 * Falls back to clearing the whole cache if the changed file is not yet
 * in the index (e.g. a brand-new file that has never been requested).
 */
export function invalidateDependentCache(changedFile: string): void {
  const affectedEntries = reverseDependencyIndex.get(changedFile);

  if (!affectedEntries || affectedEntries.size === 0) {
    // File not tracked yet — clear everything to be safe.
    bundleCache.clear();
    cssOutputCache.clear();
    dependencyGraph.clear();
    reverseDependencyIndex.clear();
    log.info(`Cache cleared (${path.basename(changedFile)} not yet tracked)`);
    return;
  }

  // Snapshot the set before we start mutating the index.
  const toEvict = [...affectedEntries];
  for (const entry of toEvict) {
    bundleCache.delete(entry);
    cssOutputCache.delete(entry);
    evictFromGraph(entry);
  }

  log.info(
    `Cache invalidated ${toEvict.length} entr${toEvict.length === 1 ? 'y' : 'ies'} ` +
    `for ${path.basename(changedFile)}`,
  );
}
