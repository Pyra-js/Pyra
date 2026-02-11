import type { RequestContext } from 'pyrajs-shared';
import { getPostById, updatePost, deletePost } from '../../../../data/posts.js';

export function GET(ctx: RequestContext) {
  const post = getPostById(ctx.params.id);
  if (!post) {
    return ctx.json({ error: 'Post not found' }, 404);
  }
  return ctx.json(post);
}

export async function PUT(ctx: RequestContext) {
  const body = await new Response(ctx.req).json();
  const post = updatePost(ctx.params.id, body);
  if (!post) {
    return ctx.json({ error: 'Post not found' }, 404);
  }
  return ctx.json(post);
}

export function DELETE(ctx: RequestContext) {
  const deleted = deletePost(ctx.params.id);
  if (!deleted) {
    return ctx.json({ error: 'Post not found' }, 404);
  }
  return ctx.json({ deleted: true });
}
