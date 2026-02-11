import type { RequestContext } from 'pyrajs-shared';
import { getAllPosts, createPost } from '../../../data/posts.js';

export function GET(ctx: RequestContext) {
  return ctx.json(getAllPosts());
}

export async function POST(ctx: RequestContext) {
  const body = await new Response(ctx.req).json();
  const post = createPost({
    slug: body.slug || body.title.toLowerCase().replace(/\s+/g, '-'),
    title: body.title,
    excerpt: body.excerpt || '',
    content: body.content || '',
    author: body.author || 'Anonymous',
    publishedAt: new Date().toISOString().split('T')[0],
  });
  return ctx.json(post, 201);
}
