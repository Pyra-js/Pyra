import type { RequestContext } from 'pyrajs-shared';
import { getItemById, updateItem, deleteItem } from '../../../../data/store.js';

export function GET(ctx: RequestContext) {
  const id = parseInt(ctx.params.id, 10);
  const item = getItemById(id);
  if (!item) return ctx.json({ error: `Item ${id} not found.` }, 404);
  return ctx.json(item);
}

export async function PUT(ctx: RequestContext) {
  const id = parseInt(ctx.params.id, 10);
  const body = await ctx.request.json() as { name?: string; value?: number };
  const updated = updateItem(id, body);
  if (!updated) return ctx.json({ error: `Item ${id} not found.` }, 404);
  return ctx.json(updated);
}

export function DELETE(ctx: RequestContext) {
  const id = parseInt(ctx.params.id, 10);
  const ok = deleteItem(id);
  if (!ok) return ctx.json({ error: `Item ${id} not found.` }, 404);
  return ctx.json({ deleted: id });
}
