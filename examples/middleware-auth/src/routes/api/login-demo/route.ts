import type { RequestContext } from 'pyrajs-shared';

/**
 * Convenience GET endpoint for browser demo:
 * visiting /api/login-demo sets a "demo" session cookie and redirects home.
 * Not a pattern for production — POST /api/login is the real endpoint.
 */
export function GET(ctx: RequestContext) {
  ctx.cookies.set('session', 'demo-user', { httpOnly: true, maxAge: 3600, path: '/' });
  return ctx.redirect('/dashboard');
}
