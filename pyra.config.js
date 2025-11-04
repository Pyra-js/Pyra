import { defineConfig } from './packages/cli/dist/index.js';

/**
 * Pyra Configuration
 *
 * This is the configuration file for the Pyra.js monorepo itself (for development/testing).
 * For example configurations that users would use, see the examples/ directory.
 *
 * Note: This imports from the built dist files in the monorepo.
 * User projects would import from 'pyrajs-cli' instead.
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
      '@': './src',
    },
  },

  // Build configuration
  build: {
    sourcemap: true,
    target: 'es2020',
  },
});
