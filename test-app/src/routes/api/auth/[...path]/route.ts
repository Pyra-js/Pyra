// Auth catch-all API route — demonstrates [...path] catch-all params
import type { RequestContext } from "pyrajs-shared";

export function GET(ctx: RequestContext) {
  return ctx.json({
    path: ctx.params.path,
    url: ctx.url.pathname,
  });
}

export function POST(ctx: RequestContext) {
  return ctx.json({
    path: ctx.params.path,
    method: "POST",
  });
}
