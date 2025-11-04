import * as esbuild from 'esbuild';
import { log, type PyraConfig, getOutDir, getEntry } from 'pyrajs-shared';
import path from 'node:path';
import fs from 'node:fs';

export interface BuildOptions {
  config?: PyraConfig;
  root?: string;
  outDir?: string;
  minify?: boolean;
  sourcemap?: boolean | 'inline' | 'external';
}

/**
 * Build for production using esbuild
 */
export async function build(options: BuildOptions = {}): Promise<void> {
  const root = options.root || process.cwd();
  const config = options.config || {};

  // Get entry point(s)
  const entry = getEntry(config);
  const outDir = options.outDir || getOutDir(config);
  const minify = options.minify ?? config.build?.minify ?? true;
  const sourcemap = options.sourcemap ?? config.build?.sourcemap ?? false;

  log.info('Building for production...');

  try {
    // Resolve entry points
    const entryPoints = resolveEntryPoints(entry, root);

    // Clear output directory
    const outPath = path.resolve(root, outDir);
    if (fs.existsSync(outPath)) {
      fs.rmSync(outPath, { recursive: true, force: true });
      log.info(`Cleared output directory: ${outDir}`);
    }

    // Build with esbuild
    const result = await esbuild.build({
      entryPoints,
      bundle: true,
      minify,
      sourcemap,
      outdir: outPath,
      format: 'esm',
      target: config.build?.target || 'es2020',
      splitting: config.build?.splitting ?? true,
      metafile: true,
      platform: 'browser',
      loader: {
        '.ts': 'ts',
        '.tsx': 'tsx',
        '.jsx': 'jsx',
        '.js': 'js',
      },
      logLevel: 'silent', // We'll handle logging ourselves
      ...config.esbuild, // Allow custom esbuild options
    });

    // Log bundle info
    if (result.metafile) {
      const outputs = Object.keys(result.metafile.outputs);
      log.success(`Built ${outputs.length} file(s) to ${outDir}/`);

      // Show output files with sizes
      outputs.forEach((output) => {
        const relativePath = path.relative(outPath, output);
        const size = result.metafile!.outputs[output].bytes;
        const sizeKB = (size / 1024).toFixed(2);
        log.info(`  ${relativePath} (${sizeKB} KB)`);
      });
    } else {
      log.success(`Build complete! Output: ${outDir}/`);
    }

    // Check for warnings
    if (result.warnings.length > 0) {
      log.warn(`Build completed with ${result.warnings.length} warning(s):`);
      result.warnings.forEach((warning) => {
        log.warn(`  ${warning.text}`);
      });
    }

  } catch (error) {
    if (error instanceof Error) {
      log.error(`Build failed: ${error.message}`);
    } else {
      log.error('Build failed with unknown error');
    }
    throw error;
  }
}

/**
 * Resolve entry points to absolute paths
 */
function resolveEntryPoints(
  entry: string | string[] | Record<string, string>,
  root: string
): string[] | Record<string, string> {
  // Single entry string
  if (typeof entry === 'string') {
    return [path.resolve(root, entry)];
  }

  // Array of entries
  if (Array.isArray(entry)) {
    return entry.map(e => path.resolve(root, e));
  }

  // Object with named entries
  const resolved: Record<string, string> = {};
  for (const [name, entryPath] of Object.entries(entry)) {
    resolved[name] = path.resolve(root, entryPath);
  }
  return resolved;
}
