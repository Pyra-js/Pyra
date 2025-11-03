import { defineConfig } from './packages/shared/src/types.js';

/**
 * Pyra Configuration
 *
 * This is the configuration file for the Pyra.js monorepo itself.
 * For example configurations, see the examples/ directory.
 *
 * Note: This config uses relative imports because it's in the monorepo.
 * User projects would import from '@pyra/shared' instead.
 */
export default defineConfig({
  // Default entry point
  entry: 'src/index.ts',

  // Output directory
  outDir: 'dist',

  // Dev server configuration
  server: {
    port: 3000,
    open: false,
    hmr: true,
  },

  // Path aliases for clean imports
  resolve: {
    alias: {
      '@pyra/shared': './packages/shared/src',
      '@pyra/core': './packages/core/src',
      '@pyra/cli': './packages/cli/src',
      '@pyra/plugins': './packages/plugins/src',
    },
  },

  // Build configuration
  build: {
    sourcemap: true,
    target: 'es2020',
  },
});
