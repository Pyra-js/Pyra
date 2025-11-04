import { defineConfig } from 'pyrajs-cli';

export default defineConfig({
  // Entry point
  entry: 'src/index.ts',

  // Dev server configuration
  server: {
    port: 3000,
    open: true,
  },

  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
