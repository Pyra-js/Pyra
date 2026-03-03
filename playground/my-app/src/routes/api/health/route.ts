import type { RequestContext } from '@pyra/cli';

export function GET(ctx: RequestContext) {
  return ctx.json({ status: 'ok', timestamp: new Date().toISOString() });
}
