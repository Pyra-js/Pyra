import React from 'react';
import { Link } from '@pyra-js/adapter-react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '900px', margin: '0 auto', padding: '0 1rem' }}>
      <header style={{ borderBottom: '2px solid #e5e7eb', padding: '1rem 0' }}>
        <nav style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/" style={{ fontWeight: 'bold', textDecoration: 'none', color: '#ef4444' }}>
            Routing Showcase
          </Link>
          <Link href="/about" style={{ textDecoration: 'none', color: '#6b7280' }}>About (static)</Link>
          <Link href="/products/42" style={{ textDecoration: 'none', color: '#6b7280' }}>Product 42 (dynamic)</Link>
          <Link href="/docs/guides/getting-started" style={{ textDecoration: 'none', color: '#6b7280' }}>Docs (catch-all)</Link>
          <Link href="/login" style={{ textDecoration: 'none', color: '#6b7280' }}>Login (group)</Link>
          <Link href="/register" style={{ textDecoration: 'none', color: '#6b7280' }}>Register (group)</Link>
        </nav>
      </header>
      <main style={{ padding: '2rem 0' }}>{children}</main>
    </div>
  );
}
