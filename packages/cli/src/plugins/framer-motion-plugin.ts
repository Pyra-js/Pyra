import type { PyraPlugin } from "@pyra-js/shared";

/**
 * `pyraFramerMotion()` — Pyra plugin for Framer Motion + SSR compatibility.
 *
 * Injects a `<style>` tag that keeps all Framer Motion elements visible during
 * SSR and before hydration. Pair with `<FramerMotionReady>` from
 * `@pyra-js/adapter-react` in your root layout to remove the override after
 * Framer Motion hydrates and takes control.
 *
 * @example
 * ```ts
 * // pyra.config.ts
 * import { pyraFramerMotion } from '@pyra-js/cli';
 * export default defineConfig({
 *   plugins: [pyraFramerMotion()],
 * });
 * ```
 */
export function pyraFramerMotion(): PyraPlugin {
  return {
    name: "pyra:framer-motion",
    headInjection() {
      return `<style id="__pyra_fm">[data-projection-id]{opacity:1!important;transform:none!important}</style>`;
    },
  };
}
