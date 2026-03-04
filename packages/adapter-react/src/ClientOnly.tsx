import { useState, useEffect } from "react";
import type { ReactNode } from "react";

export interface ClientOnlyProps {
  /** Content to render only in the browser. */
  children: ReactNode;
  /**
   * Content to render on the server during SSR (and on the client before
   * hydration). Defaults to null.
   */
  fallback?: ReactNode;
}

/**
 * Renders `children` only in the browser. During SSR and before hydration,
 * renders `fallback` (default: null) instead.
 *
 * Use this to wrap components that rely on browser-only APIs such as
 * `localStorage`, `canvas`, `WebGL`, `window.matchMedia`, or third-party
 * libraries that access `window` or `document` on import.
 *
 * @example
 * <ClientOnly fallback={<div className="map-placeholder" />}>
 *   <MapComponent center={coords} zoom={12} />
 * </ClientOnly>
 *
 * @example
 * <ClientOnly>
 *   <ThemeToggle />
 * </ClientOnly>
 */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted ? <>{children}</> : <>{fallback}</>;
}
