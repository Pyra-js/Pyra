import type * as esbuild from 'esbuild';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const CONFIG_FILES = [
  'postcss.config.js',
  'postcss.config.mjs',
  'postcss.config.cjs',
];

/**
 * Returns true if a postcss.config.* file exists in the given project root.
 */
export function hasPostCSSConfig(root: string): boolean {
  return CONFIG_FILES.some(f => fs.existsSync(path.join(root, f)));
}

// Cache per root so repeated calls (e.g. from the dev-server static handler)
// don't re-load PostCSS and its plugins on every request.
const postcssCache = new Map<string, { postcss: any; plugins: any[] } | null>();

/**
 * Run a CSS string through PostCSS using the config in `root`.
 * Returns the processed CSS, or the original source if PostCSS is not
 * configured / not installed.
 */
export async function runPostCSS(root: string, source: string, from: string): Promise<string> {
  if (!postcssCache.has(root)) {
    postcssCache.set(root, await loadPostCSS(root));
  }
  const config = postcssCache.get(root);
  if (!config) return source;
  try {
    const result = await config.postcss(config.plugins).process(source, { from });
    return result.css;
  } catch {
    return source;
  }
}

/**
 * Returns an esbuild plugin that processes CSS files through PostCSS.
 *
 * PostCSS and its plugins are loaded lazily from the user's own node_modules
 * on the first CSS file encountered — no PostCSS dependency is required in
 * @pyra-js/core itself. If no postcss.config.* is found, or if postcss is not
 * installed in the user's project, CSS files pass through esbuild unchanged.
 */
export function createPostCSSPlugin(root: string): esbuild.Plugin {
  // Config is loaded once on the first CSS file and then reused.
  let ready = false;
  let postcss: ((plugins: unknown[]) => { process(css: string, opts: { from: string }): Promise<{ css: string }> }) | null = null;
  let plugins: unknown[] = [];

  return {
    name: 'pyra-postcss',
    setup(build) {
      build.onLoad({ filter: /\.css$/ }, async (args) => {
        if (!ready) {
          ready = true;
          const loaded = await loadPostCSS(root);
          if (loaded) {
            postcss = loaded.postcss;
            plugins = loaded.plugins;
          }
        }

        // No PostCSS config found — let esbuild handle the CSS as-is.
        if (!postcss) return undefined;

        const source = fs.readFileSync(args.path, 'utf-8');
        try {
          const result = await postcss(plugins).process(source, { from: args.path });
          return { contents: result.css, loader: 'css' as const };
        } catch (err) {
          return {
            errors: [{
              text: `PostCSS error in ${path.relative(root, args.path)}: ${err instanceof Error ? err.message : String(err)}`,
            }],
          };
        }
      });
    },
  };
}

// ─── Internals ────────────────────────────────────────────────────────────────

async function loadPostCSS(
  root: string,
): Promise<{ postcss: any; plugins: any[] } | null> {
  const configFile = CONFIG_FILES
    .map(f => path.join(root, f))
    .find(f => fs.existsSync(f));

  if (!configFile) return null;

  // Resolve all modules from the user's project, not from Pyra's own deps.
  const projectRequire = createRequire(path.join(root, 'package.json'));

  // Load postcss itself.
  let postcss: any;
  try {
    const postcssEntry = projectRequire.resolve('postcss');
    const mod = await import(pathToFileURL(postcssEntry).href);
    postcss = mod.default ?? mod;
  } catch {
    return null; // postcss not installed in the user's project
  }

  // Load the postcss config (supports ESM and CJS via dynamic import).
  let config: any;
  try {
    const mod = await import(pathToFileURL(configFile).href);
    config = mod.default ?? mod;
  } catch {
    return null;
  }

  const resolvedPlugins = await resolvePlugins(config.plugins ?? [], projectRequire);
  return { postcss, plugins: resolvedPlugins };
}

/**
 * Resolve postcss plugins from either the array or object config format.
 *
 * Array format (plugins already instantiated):
 *   plugins: [tailwindcss(), autoprefixer()]
 *
 * Object format (resolved by name from the user's node_modules):
 *   plugins: { tailwindcss: {}, autoprefixer: {} }
 */
async function resolvePlugins(
  pluginsConfig: unknown,
  projectRequire: NodeRequire,
): Promise<unknown[]> {
  if (Array.isArray(pluginsConfig)) {
    return pluginsConfig.filter(Boolean);
  }

  if (pluginsConfig && typeof pluginsConfig === 'object') {
    const result: unknown[] = [];

    for (const [name, opts] of Object.entries(pluginsConfig as Record<string, unknown>)) {
      if (opts === false) continue; // explicitly disabled
      try {
        const pluginEntry = projectRequire.resolve(name);
        const mod = await import(pathToFileURL(pluginEntry).href);
        const fn = mod.default ?? mod;

        if (typeof fn === 'function') {
          const hasOpts = opts && typeof opts === 'object' && Object.keys(opts as object).length > 0;
          result.push(hasOpts ? fn(opts) : fn());
        } else {
          result.push(fn);
        }
      } catch {
        // Plugin not installed or failed to load — skip silently.
      }
    }

    return result;
  }

  return [];
}
