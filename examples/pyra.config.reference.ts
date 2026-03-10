/**
 * Pyra Configuration Reference
 *
 * This file documents every field currently supported by PyraConfig.
 * Most projects only need a handful of these — see the example apps
 * in the sibling directories for realistic usage.
 *
 * Run: pnpm --filter <example-name> dev
 */

import { defineConfig, defineConfigFn } from '@pyra-js/cli';
import { createReactAdapter } from '@pyra-js/adapter-react';
import { pyraImages } from '@pyra-js/core';

// ── Static config ─────────────────────────────────────────────────────────────

export default defineConfig({
  // Required: the framework adapter. Use createReactAdapter() for React projects.
  // Set to false to opt into SPA (no SSR) mode with no server-side rendering.
  adapter: createReactAdapter(),

  // Directory that contains page/route/layout/middleware files.
  // Default: 'src/routes'
  routesDir: 'src/routes',

  // Project root (defaults to process.cwd())
  root: process.cwd(),

  // Server settings for `pyra dev`
  server: {
    port: 3000,
    host: 'localhost', // '0.0.0.0' to expose to the network
    open: false,       // auto-open browser tab on start

    // Proxy — forward requests matching a prefix to another server.
    // Useful for hitting a separate API backend without CORS issues.
    proxy: {
      '/api/external': 'http://localhost:4000',
    },
  },

  // Build settings for `pyra build`
  build: {
    outDir: 'dist',
    sourcemap: false,  // true | false | 'inline'
    minify: true,      // auto-enabled in production
    publicDir: 'public',
  },

  // Module resolution
  resolve: {
    // Path aliases — values are resolved relative to `root`.
    alias: {
      '@': './src',
      '@components': './src/components',
    },
    // Extension search order when importing without an extension.
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    // package.json fields preferred when resolving node_modules packages.
    mainFields: ['module', 'main'],
  },

  // Environment variables
  env: {
    // Only variables with this prefix are forwarded to the browser.
    // The prefix is stripped from the key in ctx.env.
    // e.g. PYRA_API_URL → ctx.env.API_URL
    prefix: 'PYRA_',
  },

  // Request tracing — adds Server-Timing headers and dev-dashboard metrics.
  // 'off' | 'header' | 'on'
  // In production, prefer 'header' (low overhead) or 'off'.
  trace: {
    production: 'off',
  },

  // Build report — warn when a client chunk exceeds this gzip-estimated size (bytes).
  buildReport: {
    warnSize: 50_000,
  },

  // Plugins — extend the build and dev server with custom behaviour.
  // pyraImages() is the built-in image-optimization plugin (requires sharp).
  plugins: [
    pyraImages({
      formats: ['webp', 'avif'],
      sizes: [640, 1280, 1920],
      quality: 80,
    }),
  ],
});

// ── Mode-aware config ─────────────────────────────────────────────────────────
// Use defineConfigFn when dev and prod need different values.

export const modeAwareExample = defineConfigFn((mode) => ({
  adapter: createReactAdapter(),
  routesDir: 'src/routes',
  build: {
    sourcemap: mode === 'development',
    minify: mode === 'production',
  },
  trace: {
    production: mode === 'production' ? 'header' : 'off',
  },
}));
