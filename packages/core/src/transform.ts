import * as esbuild from 'esbuild';
import { log } from 'pyrajs-shared';
import path from 'node:path';

/**
 * Transform TypeScript/JSX files to JavaScript using esbuild
 */
export async function transformFile(
  filePath: string,
  code: string,
): Promise<string> {
  const ext = path.extname(filePath);

  // Only transform TypeScript and JSX files
  const shouldTransform = /\.(tsx?|jsx?)$/.test(ext);

  if (!shouldTransform) {
    return code;
  }

  try {
    const result = await esbuild.transform(code, {
      loader: getLoader(ext),
      target: 'es2020',
      format: 'esm',
      sourcemap: 'inline',
      sourcefile: filePath,
    });

    return result.code;
  } catch (error) {
    log.error(`Failed to transform ${filePath}`);
    throw error;
  }
}

/**
 * Determine esbuild loader based on file extension
 */
function getLoader(ext: string): esbuild.Loader {
  switch (ext) {
    case '.ts':
      return 'ts';
    case '.tsx':
      return 'tsx';
    case '.jsx':
      return 'jsx';
    case '.js':
      return 'js';
    default:
      return 'js';
  }
}
