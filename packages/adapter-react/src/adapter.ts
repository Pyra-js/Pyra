import { renderToString } from "react-dom/server";
import { createElement } from "react";
import type { PyraAdapter, RenderContext } from "pyrajs-shared";

const DEFAULT_SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
 * Core never sees React — it calls these methods through the
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
      // In v0.2 data is always null — params are the only props.
      // In v0.3+ data comes from load() and is merged in.
      const props: Record<string, unknown> = {};
      if (data && typeof data === "object") {
        Object.assign(props, data);
      }
      props.params = context.params;

      // The component is the default export from page.tsx — a React component.
      // Core passes it as `unknown`; we know it's a ComponentType.
      const element = createElement(
        component as React.ComponentType<any>,
        props,
      );
      return renderToString(element);
    },

    getHydrationScript(clientEntryPath: string, containerId: string): string {
      // This script runs in the browser after the SSR'd HTML is loaded.
      // It imports the component module and hydrates the server-rendered markup.
      return `
import { hydrateRoot } from "react-dom/client";
import { createElement } from "react";
import Component from "${clientEntryPath}";

const container = document.getElementById("${containerId}");
const dataEl = document.getElementById("__pyra_data");
const data = dataEl ? JSON.parse(dataEl.textContent || "{}") : {};
hydrateRoot(container, createElement(Component, data));
`;
    },

    getDocumentShell(): string {
      return DEFAULT_SHELL;
    },
  };
}
