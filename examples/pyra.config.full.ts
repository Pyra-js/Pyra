import { defineConfig } from '@pyra/cli';
import type { PyraPlugin } from '@pyra/cli';

/**
 * Full Pyra Configuration
 *
 * Demonstrates all available configuration options.
 * Most projects won't need all of these - pick what you need!
 */
export default defineConfig({
  // ===========================
  // Entry & Output
  // ===========================

  // Single entry point
  entry: 'src/index.ts',

  // OR multiple entry points
  // entry: {
  //   main: 'src/main.ts',
  //   admin: 'src/admin.ts',
  // },

  // Output directory (can also be set via build.outDir)
  outDir: 'dist',

  // Build mode (usually set via CLI: --mode production)
  mode: 'development',

  // Project root directory
  root: process.cwd(),

  // ===========================
  // Dev Server
  // ===========================

  server: {
    port: 3000,
    host: 'localhost', // or '0.0.0.0' to expose to network
    https: false, // Set to true for HTTPS
    open: false, // Auto-open browser on start
    hmr: true, // Hot Module Replacement
    cors: true, // Enable CORS

    // Proxy API requests to backend
    proxy: {
      '/api': 'http://localhost:4000',
      '/graphql': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/graphql/, '/api/graphql'),
      },
    },
  },

  // ===========================
  // Build Configuration
  // ===========================

  build: {
    outDir: 'dist',

    // Sourcemaps: true | false | 'inline' | 'external'
    sourcemap: true,

    // Minify output (auto-enabled in production)
    minify: true,

    // Target browser/environment
    target: 'es2020', // or ['es2020', 'chrome91', 'firefox90']

    // External dependencies (won't be bundled)
    external: ['react', 'react-dom'],

    // Assets to include (beyond default images, fonts, etc.)
    assetsInclude: [/\.wasm$/, /\.pdf$/],

    // Public directory for static files
    publicDir: 'public',

    // Base public path when deployed
    base: '/', // or '/my-app/' for subdirectory deployment

    // Enable code splitting
    splitting: true,

    // Warn if chunks exceed this size (in KB)
    chunkSizeWarningLimit: 500,
  },

  // ===========================
  // Module Resolution
  // ===========================

  resolve: {
    // Path aliases
    alias: {
      '@': './src',
      '@components': './src/components',
      '@utils': './src/utils',
      '@hooks': './src/hooks',
      '@styles': './src/styles',
      '@types': './src/types',
    },

    // File extensions to resolve
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.mjs'],

    // package.json fields to check
    mainFields: ['module', 'jsnext:main', 'main'],

    // Conditions for package.json exports
    conditions: ['import', 'module', 'browser', 'default'],
  },

  // ===========================
  // Environment Variables
  // ===========================

  env: {
    // Directory containing .env files
    dir: process.cwd(),

    // Prefix for variables exposed to client
    // Only vars starting with this will be bundled
    prefix: 'PYRA_',

    // Additional env files to load
    files: ['.env.local', '.env.production'],
  },

  // ===========================
  // Build-time Constants
  // ===========================

  define: {
    __APP_VERSION__: JSON.stringify('1.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },

  // ===========================
  // Features
  // ===========================

  features: {
    cssModules: true, // Enable CSS Modules
    typeCheck: true, // Type-check TypeScript
    jsx: true, // Enable JSX/TSX
  },

  // ===========================
  // Framework Integration
  // ===========================

  framework: {
    name: 'react', // 'react' | 'vue' | 'svelte' | 'preact' | 'solid'
    options: {
      // React-specific options
      refresh: true, // Fast Refresh
      jsxRuntime: 'automatic', // or 'classic'
    },
  },

  // ===========================
  // Plugins
  // ===========================

  plugins: [
    // Example custom plugin
    customPlugin(),

    // Example transform plugin
    {
      name: 'my-transform',
      transform(code, id) {
        if (id.endsWith('.custom')) {
          return {
            code: code.replace(/OLD/g, 'NEW'),
            map: null,
          };
        }
        return null;
      },
    },
  ],

  // ===========================
  // Advanced: esbuild Options
  // ===========================

  esbuild: {
    // Override esbuild options directly
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    // ...other esbuild options
  },
});

// ===========================
// Example Custom Plugin
// ===========================

function customPlugin(): PyraPlugin {
  return {
    name: 'custom-plugin',

    // Modify config before it's finalized
    config(config, mode) {
      console.log(`Building in ${mode} mode`);
      return config;
    },

    // Called when setting up the build
    setup(api) {
      const config = api.getConfig();
      console.log(`Entry: ${config.entry}`);

      // Add esbuild plugin
      // api.addEsbuildPlugin({
      //   name: 'example',
      //   setup(build) {
      //     // esbuild plugin logic
      //   },
      // });
    },

    // Transform individual modules
    transform(code, id) {
      if (id.endsWith('.special.js')) {
        return {
          code: `// Transformed\n${code}`,
          map: null,
        };
      }
      return null;
    },

    // Lifecycle hooks
    buildStart() {
      console.log('Build starting...');
    },

    buildEnd() {
      console.log('Build complete!');
    },

    serverStart(server) {
      console.log(`Dev server started on port ${server.port}`);
    },
  };
}
