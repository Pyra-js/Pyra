import { defineConfig } from 'pyrajs-cli';

/**
 * Library/Package Configuration
 *
 * Setup for building npm packages or libraries
 */
export default defineConfig({
  // Multiple entry points for different exports
  entry: {
    index: 'src/index.ts',
    utils: 'src/utils/index.ts',
    hooks: 'src/hooks/index.ts',
  },

  outDir: 'dist',

  build: {
    // Generate sourcemaps for debugging
    sourcemap: 'external',

    // Target modern browsers/Node
    target: ['es2020', 'node16'],

    // Don't bundle dependencies - let consumers handle them
    external: [
      'react',
      'react-dom',
      'vue',
      // Add all your peerDependencies here
    ],

    // No code splitting for libraries
    splitting: false,

    // Minify for production
    minify: true,
  },

  resolve: {
    alias: {
      '@': './src',
    },
  },

  features: {
    typeCheck: true, // Important for libraries
    jsx: true,
  },

  // Custom esbuild config for dual CJS/ESM builds
  esbuild: {
    format: 'esm', // or 'cjs' for CommonJS
    platform: 'neutral', // Works in both browser and Node
  },
});
