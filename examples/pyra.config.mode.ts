import { defineConfigFn } from '@pyra/shared';

/**
 * Mode-based Configuration
 *
 * Use defineConfigFn to return different configs based on mode.
 * Run with: pyra dev (development) or pyra build (production)
 */
export default defineConfigFn((mode) => {
  const isDev = mode === 'development';
  const isProd = mode === 'production';

  return {
    entry: 'src/index.ts',
    outDir: isProd ? 'dist' : '.dev',

    server: {
      port: isDev ? 3000 : 8080,
      open: isDev,
    },

    build: {
      sourcemap: isDev ? 'inline' : 'external',
      minify: isProd,
      target: isProd ? 'es2020' : 'esnext',
    },

    define: {
      __DEV__: JSON.stringify(isDev),
      __PROD__: JSON.stringify(isProd),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },

    plugins: isDev
      ? [/* dev plugins */]
      : [/* prod plugins */],
  };
});
