import { renderToString } from "react-dom/server";
import { createElement } from "react";
import type { PyraAdapter, RenderContext } from "@pyra/shared";

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
      if (layoutClientPaths && layoutClientPaths.length > 0) {
        // Generate import statements for each layout
        const layoutImports = layoutClientPaths
          .map((p, i) => `import Layout${i} from "${p}";`)
          .join("\n");

        // Build nested createElement calls: Layout0 wraps Layout1 wraps ... wraps Component
        // Outermost first, so Layout0 is the root wrapper
        let inner = "createElement(Component, data)";
        for (let i = layoutClientPaths.length - 1; i >= 0; i--) {
          inner = `createElement(Layout${i}, null, ${inner})`;
        }

        return `
import { hydrateRoot } from "react-dom/client";
import { createElement } from "react";
import Component from "${clientEntryPath}";
${layoutImports}

const container = document.getElementById("${containerId}");
const dataEl = document.getElementById("__pyra_data");
const data = dataEl ? JSON.parse(dataEl.textContent || "{}") : {};
hydrateRoot(container, ${inner});
`;
      }

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
