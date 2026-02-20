import * as esbuild from 'esbuild';
import { log } from 'pyrajs-shared';
import path from 'node:path';
import { metricsStore } from './metrics.js';
import { createPostCSSPlugin } from './css-plugin.js';

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
      plugins: [getPostCSSPlugin(root)],
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

      // If we have CSS, inject it into the JS by prepending CSS injection code
      let code = jsCode;
      if (cssCode) {
        const cssInjection = `
// Inject CSS
(function() {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(cssCode)};
  document.head.appendChild(style);
})();
`;
        code = cssInjection + '\n' + jsCode;
      }

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
