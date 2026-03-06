/**
 * @pyra-js/cli
 *
 * Public API exports for Pyra CLI
 * Re-exports types and utilities that users need in their config files
 */

// Re-export types and helpers from shared package
export type {
  PyraConfig,
  PyraMode,
  PyraPlugin,
  DevServerConfig,
  BuildConfig,
  ResolveConfig,
  EnvConfig,
  // User-facing types for route files
  RequestContext,
  Middleware,
  ErrorPageProps,
  CacheConfig,
  PrerenderConfig,
} from '@pyra-js/shared';

export { defineConfig, defineConfigFn } from '@pyra-js/shared';

// Plugin factories — inline so users only need @pyra-js/cli in their config files
export { pyraImages } from '@pyra-js/core';
export { pyraFramerMotion } from './plugins/framer-motion-plugin.js';
