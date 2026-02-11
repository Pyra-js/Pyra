import React from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ padding: '1rem 0', borderBottom: '2px solid #e5e7eb' }}>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <a href="/" style={{ fontSize: '1.25rem', fontWeight: 'bold', textDecoration: 'none', color: '#ef4444' }}>
            Pyra Blog
          </a>
          <a href="/blog" style={{ textDecoration: 'none', color: '#6b7280' }}>Blog</a>
          <a href="/about" style={{ textDecoration: 'none', color: '#6b7280' }}>About</a>
          <a href="/dashboard" style={{ textDecoration: 'none', color: '#6b7280', marginLeft: 'auto' }}>Dashboard</a>
        </nav>
      </header>
      <main style={{ padding: '2rem 0' }}>
        {children}
      </main>
      <footer style={{ padding: '1rem 0', borderTop: '1px solid #e5e7eb', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
        Pyra Blog &mdash; built with Pyra.js
      </footer>
    </div>
  );
}
