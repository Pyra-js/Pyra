import { defineConfig } from '@pyra/cli';

/**
 * React Project Configuration
 *
 * Optimized setup for React applications with common patterns
 */
export default defineConfig({
  entry: 'src/main.tsx',
  outDir: 'dist',

  server: {
    port: 3000,
    open: true,
    hmr: true, // Fast Refresh for React
  },

  resolve: {
    alias: {
      '@': './src',
      '@components': './src/components',
      '@hooks': './src/hooks',
      '@pages': './src/pages',
      '@assets': './src/assets',
      '@styles': './src/styles',
      '@utils': './src/utils',
      '@store': './src/store',
    },
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
  },

  build: {
    sourcemap: true,
    target: 'es2020',
    splitting: true,

    // Common React libraries to keep external (if using CDN)
    // external: ['react', 'react-dom'],
  },

  framework: {
    name: 'react',
    options: {
      refresh: true, // React Fast Refresh
      jsxRuntime: 'automatic', // Use new JSX transform
    },
  },

  features: {
    cssModules: true, // *.module.css support
    jsx: true,
    typeCheck: true,
  },

  define: {
    // Replace process.env.NODE_ENV in code
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },

  env: {
    prefix: ['PYRA_', 'REACT_APP_'], // Support both prefixes
  },
});
