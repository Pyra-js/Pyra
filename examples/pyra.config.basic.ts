import { defineConfig } from "pyrajs-cli";

/**
 * Basic Pyra Configuration
 *
 * Common options for most projects
 */
export default defineConfig({
  // Entry point (default: 'src/index.ts')
  entry: 'src/main.ts',

  // Output directory (default: 'dist')
  outDir: 'build',

  // Dev server port (default: 3000)
  port: 8080,

  // Path aliases for cleaner imports
  resolve: {
    alias: {
      '@': './src',
      '@components': './src/components',
      '@utils': './src/utils',
    },
  },
});
