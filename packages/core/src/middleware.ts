import type { Middleware, RequestContext } from "@pyra-js/shared";

/**
 * Run a chain of middleware functions in order, then call the final handler.
 *
 * Each middleware receives a `next()` function it can call to proceed to the
 * next middleware (or the final handler). If a middleware returns a Response
 * without calling next(), the chain short-circuits.
 *
 * @param chain        - Middleware functions, outermost first.
 * @param context      - The RequestContext for the current request.
 * @param finalHandler - The route handler that runs after all middleware.
 */
export function runMiddleware(
  chain: Middleware[],
  context: RequestContext,
  finalHandler: () => Promise<Response>,
): Promise<Response> {
  let index = 0;

  function next(): Promise<Response> {
    if (index >= chain.length) {
      return finalHandler();
    }
    const mw = chain[index++];
    const result = mw(context, next);
    // Normalize sync returns to Promise
    return result instanceof Promise ? result : Promise.resolve(result);
  }

  return next();
}
