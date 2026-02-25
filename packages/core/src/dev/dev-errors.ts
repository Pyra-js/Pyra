import http from "node:http";
import { pathToFileURL } from "node:url";
import type {
  PyraAdapter,
  RouteNode,
  RouteMatch,
  RenderContext,
  ErrorPageProps,
} from "pyrajs-shared";
import { log } from "pyrajs-shared";
import type { RequestTracer } from "../tracer.js";
import { injectHMRClient } from "./dev-hmr.js";
import { DEFAULT_SHELL } from "./dev-ssr.js";

// ── ErrorsHost ────────────────────────────────────────────────────────────────

export interface ErrorsHost {
  adapter: PyraAdapter | undefined;
  containerId: string;
  errorFiles: Map<string, string>;
  notFoundPage: string | undefined;
  /** Bound delegate — compiles a route module for server-side execution. */
  compileForServer(filePath: string): Promise<string>;
}

// ── renderErrorPage ───────────────────────────────────────────────────────────

/**
 * Render the nearest error boundary (error.tsx) for a caught error.
 * Falls back to the default styled error page if no boundary exists or the
 * boundary itself throws.
 */
export async function renderErrorPage(
  host: ErrorsHost,
  req: http.IncomingMessage,
  pathname: string,
  error: unknown,
  route: RouteNode | null,
  match: RouteMatch | null,
  tracer: RequestTracer,
): Promise<Response> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  log.error(`Error rendering ${pathname}: ${message}`);

  // Try to find and render the nearest error boundary
  const errorBoundaryId = route?.errorBoundaryId;
  if (errorBoundaryId && host.adapter) {
    const errorFilePath = host.errorFiles.get(errorBoundaryId);
    if (errorFilePath) {
      try {
        tracer.start("error-boundary", errorFilePath);
        const compiled = await host.compileForServer(errorFilePath);
        const modUrl = pathToFileURL(compiled).href + `?t=${Date.now()}`;
        const mod = await import(modUrl);

        if (mod.default) {
          const errorProps: ErrorPageProps = {
            message,
            stack,
            statusCode: 500,
            pathname,
          };

          const headTags: string[] = [];
          const renderContext: RenderContext = {
            url: new URL(
              pathname,
              `http://${req.headers.host || "localhost"}`,
            ),
            params: match?.params || {},
            pushHead: (tag) => headTags.push(tag),
            error: errorProps,
          };

          const bodyHtml = await host.adapter.renderToHTML(
            mod.default,
            errorProps,
            renderContext,
          );
          tracer.end();

          const shell =
            host.adapter.getDocumentShell?.() || DEFAULT_SHELL;
          let html = shell.replace("__CONTAINER_ID__", host.containerId);
          html = html.replace("<!--pyra-outlet-->", bodyHtml);
          html = html.replace("<!--pyra-head-->", headTags.join("\n  "));
          html = injectHMRClient(html);

          return new Response(html, {
            status: 500,
            headers: { "Content-Type": "text/html" },
          });
        }
        tracer.end();
      } catch (renderError) {
        // Error boundary itself failed — fall through to default
        const errMsg =
          renderError instanceof Error
            ? renderError.message
            : String(renderError);
        tracer.endWithError(errMsg);
        log.error(`Error boundary failed: ${errMsg}`);
      }
    }
  }

  // Fallback: default styled error HTML
  return new Response(getErrorHTML(pathname, error), {
    status: 500,
    headers: { "Content-Type": "text/html" },
  });
}

// ── renderNotFoundPage ────────────────────────────────────────────────────────

/**
 * Render the custom 404 page (404.tsx) if one exists, otherwise return a
 * default styled 404 page.
 */
export async function renderNotFoundPage(
  host: ErrorsHost,
  req: http.IncomingMessage,
  pathname: string,
  tracer: RequestTracer,
): Promise<Response> {
  if (host.notFoundPage && host.adapter) {
    try {
      tracer.start("404-page", host.notFoundPage);
      const compiled = await host.compileForServer(host.notFoundPage);
      const modUrl = pathToFileURL(compiled).href + `?t=${Date.now()}`;
      const mod = await import(modUrl);

      if (mod.default) {
        const headTags: string[] = [];
        const renderContext: RenderContext = {
          url: new URL(
            pathname,
            `http://${req.headers.host || "localhost"}`,
          ),
          params: {},
          pushHead: (tag) => headTags.push(tag),
        };

        const bodyHtml = await host.adapter.renderToHTML(
          mod.default,
          { pathname },
          renderContext,
        );
        tracer.end();

        const shell =
          host.adapter.getDocumentShell?.() || DEFAULT_SHELL;
        let html = shell.replace("__CONTAINER_ID__", host.containerId);
        html = html.replace("<!--pyra-outlet-->", bodyHtml);
        html = html.replace("<!--pyra-head-->", headTags.join("\n  "));
        html = injectHMRClient(html);

        return new Response(html, {
          status: 404,
          headers: { "Content-Type": "text/html" },
        });
      }
      tracer.end();
    } catch (renderError) {
      const errMsg =
        renderError instanceof Error
          ? renderError.message
          : String(renderError);
      tracer.endWithError(errMsg);
      log.error(`Failed to render custom 404 page: ${errMsg}`);
    }
  }

  // Fallback: default styled 404
  return new Response(getDefault404HTML(pathname), {
    status: 404,
    headers: { "Content-Type": "text/html" },
  });
}

// ── getDefault404HTML ─────────────────────────────────────────────────────────

/** Default styled 404 page (used when no custom 404.tsx exists). */
export function getDefault404HTML(pathname: string): string {
  return `<!DOCTYPE html>
<html><head><title>404 Not Found</title>
<style>
  body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .container { text-align: center; }
  h1 { font-size: 4rem; color: #ff6b35; margin: 0; }
  p { color: #999; margin-top: 1rem; }
  code { color: #4fc3f7; }
</style></head>
<body>
  <div class="container">
    <h1>404</h1>
    <p>Page <code>${pathname}</code> not found</p>
  </div>
</body></html>`;
}

// ── getErrorHTML ──────────────────────────────────────────────────────────────

/** Default styled 500 error page shown when no error boundary is configured. */
export function getErrorHTML(pathname: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack || "" : "";

  return `<!DOCTYPE html>
<html><head><title>Pyra Error</title>
<style>
  body { font-family: monospace; background: #1a1a2e; color: #e0e0e0; padding: 40px; }
  h1 { color: #ff6b35; }
  .path { color: #4fc3f7; }
  pre { background: #0f0f1a; padding: 20px; border-radius: 8px; overflow-x: auto;
        border-left: 3px solid #ff6b35; white-space: pre-wrap; }
</style></head>
<body>
  <h1>Server Error</h1>
  <p>Error rendering <span class="path">${pathname}</span></p>
  <pre>${message}\n\n${stack}</pre>
</body></html>`;
}
