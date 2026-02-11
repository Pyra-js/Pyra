import type { RequestContext } from 'pyrajs-shared';

export default async function throwingMiddleware(ctx: RequestContext, next: () => Promise<Response>) {
  throw new Error('Intentional middleware error');
}
