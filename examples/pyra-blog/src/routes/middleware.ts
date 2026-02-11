import type { RequestContext } from 'pyrajs-shared';

export default async function requestLogger(ctx: RequestContext, next: () => Promise<Response>) {
  const start = Date.now();
  const response = await next();
  const elapsed = Date.now() - start;
  response.headers.set('X-Response-Time', `${elapsed}ms`);
  return response;
}
