// Single user API route — demonstrates dynamic params in API routes
import type { RequestContext } from "pyrajs-shared";

export function GET(ctx: RequestContext) {
  return ctx.json({
    userId: ctx.params.id,
    routeId: ctx.routeId,
  });
}

export function DELETE(ctx: RequestContext) {
  return ctx.json({ deleted: true, userId: ctx.params.id });
}
