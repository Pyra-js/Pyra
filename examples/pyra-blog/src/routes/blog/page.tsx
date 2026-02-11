import type { RequestContext } from 'pyrajs-shared';

export async function load(ctx: RequestContext) {
  const { getAllPosts } = await import('../../data/posts.js');
  return { posts: getAllPosts() };
}

export default function BlogIndex({ posts }: { posts: Array<{ slug: string; title: string; excerpt: string; publishedAt: string; author: string }> }) {
  return (
    <div>
      <h1>Blog</h1>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {posts.map((post) => (
          <li key={post.slug} style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid #f3f4f6' }}>
            <a href={`/blog/${post.slug}`} style={{ fontSize: '1.5rem', textDecoration: 'none', color: '#1f2937' }}>
              {post.title}
            </a>
            <p style={{ color: '#6b7280', margin: '0.5rem 0' }}>{post.excerpt}</p>
            <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
              <span>{post.author}</span> &middot; <time>{post.publishedAt}</time>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
