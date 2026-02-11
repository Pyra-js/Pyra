import type { RequestContext } from 'pyrajs-shared';

export async function load(ctx: RequestContext) {
  const { getAllPosts } = await import('../../data/posts.js');
  const posts = getAllPosts();
  return { posts, user: ctx.cookies.get('auth_token') || 'admin' };
}

export default function Dashboard({ posts, user }: { posts: Array<{ id: string; title: string; publishedAt: string }>; user: string }) {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome, {user}</p>
      <h2>Manage Posts ({posts.length})</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem' }}>ID</th>
            <th style={{ padding: '0.5rem' }}>Title</th>
            <th style={{ padding: '0.5rem' }}>Published</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '0.5rem' }}>{post.id}</td>
              <td style={{ padding: '0.5rem' }}>{post.title}</td>
              <td style={{ padding: '0.5rem' }}>{post.publishedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
