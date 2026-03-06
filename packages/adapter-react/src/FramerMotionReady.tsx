import { useEffect } from "react";
import type { ReactNode } from "react";

export interface FramerMotionReadyProps {
  children: ReactNode;
}

/**
 * `<FramerMotionReady>` — companion component for the `pyraFramerMotion()` plugin.
 *
 * The plugin injects a `<style id="__pyra_fm">` into SSR HTML that forces all
 * Framer Motion elements visible (`opacity: 1`, `transform: none`) so content
 * is never invisible before JS hydrates.
 *
 * After React hydrates, this component removes that override in the next
 * animation frame — after Framer Motion's own `useLayoutEffect` has run and
 * taken control of the elements. Framer Motion then runs its animations normally.
 *
 * Wrap your root layout with this component:
 *
 * ```tsx
 * import { FramerMotionReady } from '@pyra-js/adapter-react';
 * export default function Layout({ children }) {
 *   return <FramerMotionReady>{children}</FramerMotionReady>;
 * }
 * ```
 */
export function FramerMotionReady({ children }: FramerMotionReadyProps) {
  useEffect(() => {
    requestAnimationFrame(() => {
      const style = document.getElementById("__pyra_fm");
      if (style) style.remove();
    });
  }, []);

  return <>{children}</>;
}
