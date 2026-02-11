import type { RequestContext } from 'pyrajs-shared';

export async function load(ctx: RequestContext) {
  const { getAllPosts } = await import('../data/posts.js');
  const posts = getAllPosts().slice(0, 3);
  return { posts };
}

export default function Home({ posts }: { posts: Array<{ slug: string; title: string; excerpt: string; publishedAt: string }> }) {
  return (
    <div>
      <h1>Welcome to Pyra Blog</h1>
      <p>A reference application demonstrating Pyra.js features.</p>
      <h2 style={{ marginTop: '2rem' }}>Recent Posts</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {posts.map((post) => (
          <li key={post.slug} style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid #f3f4f6' }}>
            <a href={`/blog/${post.slug}`} style={{ fontSize: '1.25rem', textDecoration: 'none', color: '#1f2937' }}>
              {post.title}
            </a>
            <p style={{ color: '#6b7280', margin: '0.5rem 0 0' }}>{post.excerpt}</p>
            <time style={{ fontSize: '0.875rem', color: '#9ca3af' }}>{post.publishedAt}</time>
          </li>
        ))}
      </ul>
      <a href="/blog" style={{ color: '#ef4444' }}>View all posts &rarr;</a>
    </div>
  );
}
