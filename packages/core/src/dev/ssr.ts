import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { pathToFileURL } from "node:url";
import type {
  PyraConfig,
  PyraAdapter,
  RouteMatch,
  RouteNode,
  RenderContext,
} from "pyrajs-shared";
import { resolveRouteRenderMode } from "./render-mode.js";
import { bundleFile, getCSSOutput } from "./bundler.js";
import { escapeJsonForScript } from "./request-context.js";
import type { RequestTracer } from "./tracer.js";
import { injectHMRClient } from "./dev-hmr.js";

// ── DEFAULT_SHELL ─────────────────────────────────────────────────────────────

/** Fallback document shell used when the adapter does not provide one. */
export const DEFAULT_SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--pyra-head-->
</head>
<body>
  <div id="app"><!--pyra-outlet--></div>
</body>
</html>`;

// ── SSRHost ───────────────────────────────────────────────────────────────────

export interface SSRHost {
  adapter: PyraAdapter | undefined;
  root: string;
  containerId: string;
  config: PyraConfig | undefined;
  /** Bound delegate — compiles a route module for server-side execution. */
  compileForServer(filePath: string): Promise<string>;
}

// ── handlePageRouteInner ──────────────────────────────────────────────────────

/**
 * Inner page route handler that returns a Web `Response`.
 * Called from within the middleware chain.
 *
 * Pipeline:
 * 1. Compile the route module (esbuild, node platform).
 * 2. Import and resolve render mode (ssr / spa / ssg).
 * 3. Call `load()` if exported — short-circuit on Response return.
 * 4. Load layout components for nesting.
 * 5. Eagerly bundle client files to extract CSS.
 * 6. Render to HTML via the adapter.
 * 7. Assemble the document shell with hydration script + HMR client.
 */
export async function handlePageRouteInner(
  host: SSRHost,
  req: http.IncomingMessage,
  ctx: import("pyrajs-shared").RequestContext,
  pathname: string,
  match: RouteMatch,
  tracer: RequestTracer,
): Promise<Response> {
  const { route, params } = match;
  const adapter = host.adapter!;

  // Compile the route module for server (Node target, framework external)
  tracer.start("compile");
  const serverModule = await host.compileForServer(route.filePath);

  // Import the compiled module
  const moduleUrl = pathToFileURL(serverModule).href + `?t=${Date.now()}`;
  const mod = await import(moduleUrl);
  const component = mod.default;
  tracer.end();

  // Resolve render mode for this route
  const globalMode = host.config?.renderMode ?? "ssr";
  const mode = resolveRouteRenderMode(mod, globalMode);

  // SPA route: serve HTML shell with client module only, no SSR
  if (mode === "spa") {
    return serveSpaShell(host, req, route, tracer);
  }

  // SSR + SSG (SSG treated as SSR in dev for fast feedback)
  if (!component) {
    return new Response(
      `Route "${route.id}" (${route.filePath}) does not export a default component.`,
      { status: 500, headers: { "Content-Type": "text/plain" } },
    );
  }

  // Call load() if exported
  let data: unknown = null;
  if (typeof mod.load === "function") {
    tracer.start("load");
    try {
      const loadResult = await mod.load(ctx);

      // If load() returns a Response, short-circuit the SSR pipeline
      if (loadResult instanceof Response) {
        tracer.end();
        return loadResult;
      }

      data = loadResult;
      tracer.end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      tracer.endWithError(msg);
      throw err;
    }
  }

  // Load layout components
  const layoutComponents: unknown[] = [];
  const layoutClientUrls: string[] = [];
  if (match.layouts && match.layouts.length > 0) {
    for (const layoutNode of match.layouts) {
      const layoutModule = await host.compileForServer(layoutNode.filePath);
      const layoutUrl =
        pathToFileURL(layoutModule).href + `?t=${Date.now()}`;
      const layoutMod = await import(layoutUrl);
      if (layoutMod.default) {
        layoutComponents.push(layoutMod.default);
        // Build client URL for this layout
        const clientPath = path.relative(host.root, layoutNode.filePath);
        layoutClientUrls.push(
          "/__pyra/modules/" + clientPath.split(path.sep).join("/"),
        );
      }
    }
  }

  // Eagerly compile client modules (layouts first, then the page) to extract
  // any CSS they import. bundleFile stores the CSS in cssOutputCache as a
  // side-effect; we then build <link> tags so browsers get real stylesheets
  // instead of JS-injected <style> elements (which cause FOUC).
  const cssLinkTags: string[] = [];
  const clientFilesForCSS = [
    ...(match.layouts ?? []).map((l) => l.filePath),
    route.filePath,
  ];
  for (const clientFile of clientFilesForCSS) {
    await bundleFile(clientFile, host.root, host.config?.resolve);
    const css = getCSSOutput(clientFile);
    if (css) {
      const clientRelPath = path.relative(host.root, clientFile);
      const stylesUrl =
        "/__pyra/styles/" + clientRelPath.split(path.sep).join("/");
      cssLinkTags.push(`<link rel="stylesheet" href="${stylesUrl}">`);
    }
  }

  // Build RenderContext — CSS link tags are prepended so they load before
  // any head tags the adapter pushes (e.g. meta, title).
  const headTags: string[] = [...cssLinkTags];
  const renderContext: RenderContext = {
    url: new URL(pathname, `http://${req.headers.host || "localhost"}`),
    params,
    pushHead(tag: string) {
      headTags.push(tag);
    },
    layouts: layoutComponents.length > 0 ? layoutComponents : undefined,
  };

  // Call adapter.renderToHTML() with load data
  tracer.start("render", `${adapter.name} SSR`);
  const bodyHtml = await adapter.renderToHTML(component, data, renderContext);
  tracer.end();

  // Get document shell
  const shell = adapter.getDocumentShell?.() || DEFAULT_SHELL;

  // Build the client module URL for hydration
  const clientModulePath = path.relative(host.root, route.filePath);
  const clientModuleUrl =
    "/__pyra/modules/" + clientModulePath.split(path.sep).join("/");

  // Get hydration script from adapter (with layout paths if present)
  const hydrationScript = adapter.getHydrationScript(
    clientModuleUrl,
    host.containerId,
    layoutClientUrls.length > 0 ? layoutClientUrls : undefined,
  );

  // Serialize data for client hydration
  tracer.start("inject-assets");
  const hydrationData: Record<string, unknown> = {};
  if (data && typeof data === "object") {
    Object.assign(hydrationData, data);
  }
  hydrationData.params = params;

  const serializedData = escapeJsonForScript(JSON.stringify(hydrationData));
  const dataScript = `<script id="__pyra_data" type="application/json">${serializedData}</script>`;

  // Assemble the full HTML
  let html = shell;
  html = html.replace("__CONTAINER_ID__", host.containerId);
  html = html.replace("<!--pyra-outlet-->", bodyHtml);

  const headContent = headTags.join("\n  ");
  html = html.replace("<!--pyra-head-->", headContent);

  const scripts = [
    dataScript,
    `<script type="module">${hydrationScript}</script>`,
  ].join("\n  ");

  html = injectHMRClient(html);
  html = html.replace("</body>", `  ${scripts}\n</body>`);
  tracer.end();

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "no-cache",
    },
  });
}

// ── serveSpaShell ─────────────────────────────────────────────────────────────

/**
 * Serve an HTML shell for SPA routes.
 * No server rendering — the client module handles everything.
 */
export function serveSpaShell(
  host: SSRHost,
  _req: http.IncomingMessage,
  route: RouteNode,
  tracer: RequestTracer,
): Response {
  tracer.start("inject-assets", "SPA shell");
  const adapter = host.adapter!;
  const shell = adapter.getDocumentShell?.() || DEFAULT_SHELL;

  // Build client module URL for the route
  const clientModulePath = path.relative(host.root, route.filePath);
  const clientModuleUrl =
    "/__pyra/modules/" + clientModulePath.split(path.sep).join("/");

  let html = shell;
  html = html.replace("__CONTAINER_ID__", host.containerId);
  html = html.replace("<!--pyra-outlet-->", "");
  html = html.replace("<!--pyra-head-->", "");

  const script = `<script type="module" src="${clientModuleUrl}"></script>`;
  html = injectHMRClient(html);
  html = html.replace("</body>", `  ${script}\n</body>`);
  tracer.end();

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "no-cache",
      "X-Pyra-Render-Mode": "spa",
    },
  });
}
