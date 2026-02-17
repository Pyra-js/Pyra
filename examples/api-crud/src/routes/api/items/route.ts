import type { RequestContext } from 'pyrajs-shared';
import { getItems, createItem } from '../../../data/store.js';

export function GET(ctx: RequestContext) {
  return ctx.json(getItems());
}

export async function POST(ctx: RequestContext) {
  const body = await ctx.request.json() as { name?: string; value?: number };
  if (!body.name || body.value === undefined) {
    return ctx.json({ error: 'Both "name" and "value" are required.' }, 400);
  }
  const item = createItem({ name: body.name, value: Number(body.value) });
  return ctx.json(item, 201);
}
