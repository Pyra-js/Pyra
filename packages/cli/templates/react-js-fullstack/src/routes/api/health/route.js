export function GET(ctx) {
  return ctx.json({ status: 'ok', timestamp: new Date().toISOString() });
}
