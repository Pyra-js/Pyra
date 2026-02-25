import http from "node:http";
import { pathToFileURL } from "node:url";
import type { RequestContext, RouteMatch } from "pyrajs-shared";
import { HTTP_METHODS } from "pyrajs-shared";
import type { RequestTracer } from "../tracer.js";

// ── ApiHost ───────────────────────────────────────────────────────────────────

export interface ApiHost {
  /** Compile a route module for server-side execution and return its path. */
  compileForServer(filePath: string): Promise<string>;
}

// ── handleApiRouteInner ───────────────────────────────────────────────────────

/**
 * Inner API route handler that compiles the route module, checks the HTTP
 * method, and calls the matching export. Returns a Web `Response`.
 *
 * Called from within the middleware chain — the outer middleware runner
 * catches unhandled errors and renders the error page.
 */
export async function handleApiRouteInner(
  host: ApiHost,
  req: http.IncomingMessage,
  ctx: RequestContext,
  match: RouteMatch,
  tracer: RequestTracer,
): Promise<Response> {
  const { route } = match;

  // 1. Compile the API route module for server
  tracer.start("compile");
  const serverModule = await host.compileForServer(route.filePath);

  // 2. Import the compiled module (cache-bust for re-import after recompile)
  const moduleUrl = pathToFileURL(serverModule).href + `?t=${Date.now()}`;
  const mod = await import(moduleUrl);
  tracer.end();

  // 3. Check HTTP method
  const method = (req.method || "GET").toUpperCase();

  if (typeof mod[method] !== "function") {
    const allowedMethods = (HTTP_METHODS as readonly string[]).filter(
      (m) => typeof mod[m] === "function",
    );
    return new Response(
      JSON.stringify({
        error: `Method ${method} not allowed`,
        allowed: allowedMethods,
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          Allow: allowedMethods.join(", "),
        },
      },
    );
  }

  // 4. Call the handler with the shared RequestContext
  tracer.start("handler", method);
  try {
    const response = await mod[method](ctx);
    tracer.end();
    return response;
  } catch (handlerError) {
    const msg =
      handlerError instanceof Error
        ? handlerError.message
        : String(handlerError);
    const stack =
      handlerError instanceof Error ? handlerError.stack : undefined;
    tracer.endWithError(msg);
    // Dev mode: return full error details in JSON
    return new Response(JSON.stringify({ error: msg, stack }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
