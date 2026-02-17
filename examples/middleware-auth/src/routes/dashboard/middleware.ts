import type { RequestContext } from 'pyrajs-shared';

/**
 * Dashboard middleware — runs only for routes under /dashboard.
 * Demonstrates short-circuiting: if the session cookie is absent,
 * return a 401 Response immediately without calling next().
 */
export default async function authMiddleware(
  ctx: RequestContext,
  next: () => Promise<Response>,
): Promise<Response> {
  const session = ctx.cookies.get('session');
  if (!session) {
    return ctx.json(
      { error: 'Unauthorized', hint: 'POST /api/login first, then retry.' },
      401,
    );
  }
  // Attach the username to a custom header so the page can read it
  // (real apps would use a proper session store)
  const response = await next();
  response.headers.set('X-Authenticated-As', session);
  return response;
}
