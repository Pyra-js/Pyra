import React from 'react';

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '2rem' }}>
      <div style={{ flex: 1 }}>
        {children}
      </div>
      <aside style={{ width: '200px', fontSize: '0.875rem', color: '#6b7280' }}>
        <h3>Categories</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li><a href="/blog" style={{ textDecoration: 'none', color: '#6b7280' }}>All Posts</a></li>
          <li>Getting Started</li>
          <li>Tutorials</li>
          <li>Advanced</li>
        </ul>
      </aside>
    </div>
  );
}
