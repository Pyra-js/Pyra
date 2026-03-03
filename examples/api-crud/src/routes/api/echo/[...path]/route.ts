import type { RequestContext } from '@pyra/shared';

/**
 * Catch-all API route — matches /api/echo/anything/at/all.
 * Demonstrates that [...]  segments work the same on API routes as on pages.
 * Priority order: static > dynamic > catch-all, so a more-specific route
 * at /api/echo/something would win over this handler.
 */
export function GET(ctx: RequestContext) {
  const raw = ctx.params.path ?? '';
  const segments = raw ? raw.split('/').filter(Boolean) : [];
  return ctx.json({
    matched: 'catch-all',
    route: '/api/echo/[...path]',
    raw,
    segments,
    query: Object.fromEntries(ctx.url.searchParams),
  });
}
