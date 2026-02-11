import type { RequestContext } from 'pyrajs-shared';

export const prerender = {
  paths() {
    return [
      { slug: 'getting-started-with-pyra' },
      { slug: 'file-based-routing' },
      { slug: 'data-loading' },
    ];
  },
};

export async function load(ctx: RequestContext) {
  const { getPostBySlug } = await import('../../../data/posts.js');
  const post = getPostBySlug(ctx.params.slug);
  if (!post) {
    throw new Error(`Post not found: ${ctx.params.slug}`);
  }
  return { post };
}

export default function PostDetail({ post }: { post: { title: string; content: string; author: string; publishedAt: string } }) {
  return (
    <article>
      <h1>{post.title}</h1>
      <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '2rem' }}>
        <span>{post.author}</span> &middot; <time>{post.publishedAt}</time>
      </div>
      {post.content.split('\n\n').map((paragraph, i) => (
        <p key={i} style={{ lineHeight: 1.7, color: '#374151' }}>{paragraph}</p>
      ))}
      <a href="/blog" style={{ color: '#ef4444', marginTop: '2rem', display: 'inline-block' }}>&larr; Back to blog</a>
    </article>
  );
}
