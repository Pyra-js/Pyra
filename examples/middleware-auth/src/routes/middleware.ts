import type { RequestContext } from 'pyrajs-shared';

/**
 * Root middleware — runs on every request.
 * Demonstrates: timing, mutating response headers, and calling next().
 */
export default async function rootMiddleware(
  ctx: RequestContext,
  next: () => Promise<Response>,
): Promise<Response> {
  const requestId = Math.random().toString(36).slice(2, 10);
  const start = performance.now();

  const response = await next();

  const elapsed = (performance.now() - start).toFixed(2);
  response.headers.set('X-Request-Id', requestId);
  response.headers.set('X-Response-Time', `${elapsed}ms`);
  return response;
}
