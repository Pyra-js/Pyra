import { createElement } from "react";
import type { AnchorHTMLAttributes, MouseEvent } from "react";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function Link({ href, children, onClick, ...props }: LinkProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    // Let the browser handle modifier-key clicks (new tab, etc.)
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.altKey ||
      e.ctrlKey ||
      e.shiftKey
    ) {
      onClick?.(e);
      return;
    }

    // Only intercept same-origin navigation
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin) {
        onClick?.(e);
        return;
      }
    } catch {
      onClick?.(e);
      return;
    }

    e.preventDefault();
    onClick?.(e);

    const nav = (window as any).__pyra?.navigate;
    if (nav) {
      nav(href);
    } else {
      location.href = href;
    }
  }

  return createElement("a", { href, onClick: handleClick, ...props }, children);
}
