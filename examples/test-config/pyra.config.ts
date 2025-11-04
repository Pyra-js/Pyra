import { defineConfig } from '@pyra/cli';

/**
 * Demo configuration file
 *
 * This demonstrates how a user would actually use Pyra config.
 */
export default defineConfig({
  // Entry point
  entry: 'src/index.ts',

  // Dev server on port 8080
  port: 8080,

  // Output to 'build' instead of 'dist'
  outDir: 'build',

  // Path aliases for clean imports
  resolve: {
    alias: {
      '@': './src',
      '@components': './src/components',
      '@utils': './src/utils',
    },
  },

  // Dev server config
  server: {
    open: true, // Auto-open browser
    hmr: true,  // Hot Module Replacement
    cors: true, // Enable CORS
  },

  // Build settings
  build: {
    sourcemap: true,
    minify: true,
    target: 'es2020',
  },
});
