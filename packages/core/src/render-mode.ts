import type { RenderMode } from 'pyrajs-shared';

/**
 * Resolve the rendering mode for a single route module.
 *
 * Priority:
 * 1. `export const render = "spa" | "ssr" | "ssg"` — explicit override
 * 2. `export const prerender = true | { paths() }` — legacy SSG marker
 * 3. Global default from pyra.config.ts
 */
export function resolveRouteRenderMode(
  mod: { render?: unknown; prerender?: unknown },
  globalDefault: RenderMode,
): RenderMode {
  // 1. Explicit render export
  if (mod.render === 'spa' || mod.render === 'ssr' || mod.render === 'ssg') {
    return mod.render;
  }

  // 2. Legacy prerender export → SSG
  if (mod.prerender) {
    return 'ssg';
  }

  // 3. Global default
  return globalDefault;
}
