import type { RequestContext } from '@pyra/shared';

export function GET(ctx: RequestContext) {
  ctx.cookies.delete('session');
  return ctx.redirect('/');
}

export function POST(ctx: RequestContext) {
  ctx.cookies.delete('session');
  return ctx.json({ ok: true });
}
