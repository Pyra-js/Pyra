import type { RequestContext } from 'pyrajs-shared';

export async function POST(ctx: RequestContext) {
  const body = await ctx.request.json() as { user?: string };
  const user = body.user ?? 'guest';

  // Set a simple session cookie (httpOnly, 1 hour)
  ctx.cookies.set('session', user, { httpOnly: true, maxAge: 3600, path: '/' });
  return ctx.json({ ok: true, user });
}
