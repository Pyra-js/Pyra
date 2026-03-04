import { renderToString } from "react-dom/server";
import { createElement } from "react";
import type { PyraAdapter, RenderContext } from "@pyra-js/shared";

const DEFAULT_SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <!--pyra-head-->
</head>
<body>
  <div id="__CONTAINER_ID__"><!--pyra-outlet--></div>
</body>
</html>`;

/**
 * Create the React adapter for Pyra.
 *
 * This adapter:
 * - Renders React components to HTML via renderToString()
 * - Provides a hydration script that calls hydrateRoot()
 * - Returns a document shell with placeholder markers
 *
 * Core never sees React, it calls these methods through the
 * PyraAdapter interface with opaque `component` and `data` values.
 */
export function createReactAdapter(): PyraAdapter {
  return {
    name: "react",
    fileExtensions: [".tsx", ".jsx"],

    esbuildPlugins() {
      // esbuild has built-in JSX support. The dev server / build orchestrator
      // sets jsx: 'automatic' and jsxImportSource: 'react' in the esbuild
      // options when it detects a React adapter. No plugin needed.
      return [];
    },

    renderToHTML(
      component: unknown,
      data: unknown,
      context: RenderContext,
    ): string {
      // Merge load() data (if any) with route params into props.
      const props: Record<string, unknown> = {};
      if (data && typeof data === "object") {
        Object.assign(props, data);
      }
      props.params = context.params;

      // Build the page element
      let element = createElement(
        component as React.ComponentType<any>,
        props,
      );

      // Wrap with layouts (outermost first → we iterate in reverse so the
      // outermost layout ends up as the outermost wrapper)
      if (context.layouts && context.layouts.length > 0) {
        for (let i = context.layouts.length - 1; i >= 0; i--) {
          element = createElement(
            context.layouts[i] as React.ComponentType<any>,
            null,
            element,
          );
        }
      }

      return renderToString(element);
    },

    getHydrationScript(clientEntryPath: string, containerId: string, layoutClientPaths?: string[]): string {
      const hasLayouts = layoutClientPaths && layoutClientPaths.length > 0;

      const layoutImports = hasLayouts
        ? layoutClientPaths.map((p, i) => `import Layout${i} from "${p}";`).join("\n")
        : "";

      // Build the static return expression — Component and data come from useState,
      // layouts are stable imports (same for all navigations within this page group).
      let returnExpr = "createElement(Component, data)";
      if (hasLayouts) {
        for (let i = layoutClientPaths.length - 1; i >= 0; i--) {
          returnExpr = `createElement(Layout${i}, null, ${returnExpr})`;
        }
      }

      const pageLayouts = JSON.stringify(layoutClientPaths || []);

      return `
import { hydrateRoot } from "react-dom/client";
import { createElement, useState, useEffect } from "react";
import InitialComponent from "${clientEntryPath}";
${layoutImports}

const container = document.getElementById("${containerId}");
const dataEl = document.getElementById("__pyra_data");
const initialData = dataEl ? JSON.parse(dataEl.textContent || "{}") : {};
const pageLayouts = ${pageLayouts};

function PyraApp() {
  const [Component, setComponent] = useState(() => InitialComponent);
  const [data, setData] = useState(initialData);

  useEffect(() => {
    async function navigate(href, push = true) {
      try {
        const target = new URL(href, location.href);
        if (target.origin !== location.origin) { location.href = href; return; }
        const res = await fetch("/_pyra/navigate?path=" + encodeURIComponent(target.pathname + target.search));
        if (!res.ok) { location.href = href; return; }
        const nav = await res.json();
        if (nav.redirect) { location.href = nav.redirect; return; }
        if (JSON.stringify(nav.layoutClientEntries || []) !== JSON.stringify(pageLayouts)) {
          location.href = href; return;
        }
        const mod = await import(nav.clientEntry);
        if (push) history.pushState(null, "", href);
        setComponent(() => mod.default);
        setData(nav.data || {});
        window.scrollTo(0, 0);
      } catch { location.href = href; }
    }
    window.__pyra = window.__pyra || {};
    window.__pyra.navigate = (href) => navigate(href);
    function onPopState() { navigate(location.pathname + location.search + location.hash, false); }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return ${returnExpr};
}

hydrateRoot(container, createElement(PyraApp, null));
`;
    },

    getDocumentShell(): string {
      return DEFAULT_SHELL;
    },
  };
}
