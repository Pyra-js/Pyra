import React from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '800px', margin: '0 auto', padding: '0 1rem' }}>
      <header style={{ borderBottom: '2px solid #e5e7eb', padding: '1rem 0' }}>
        <nav style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="/" style={{ fontWeight: 'bold', textDecoration: 'none', color: '#0891b2' }}>SSG Cache</a>
          <a href="/about" style={{ textDecoration: 'none', color: '#6b7280' }}>About (SSG)</a>
          <a href="/releases/1.0" style={{ textDecoration: 'none', color: '#6b7280' }}>Releases (SSG dynamic)</a>
          <a href="/live" style={{ textDecoration: 'none', color: '#6b7280' }}>Live (SSR + cache)</a>
        </nav>
      </header>
      <main style={{ padding: '2rem 0' }}>{children}</main>
    </div>
  );
}
