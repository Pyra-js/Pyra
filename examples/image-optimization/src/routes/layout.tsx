import React from 'react';
import { Link } from '@pyra-js/adapter-react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '900px', margin: '0 auto', padding: '0 1.5rem' }}>
      <header style={{ borderBottom: '2px solid #e5e7eb', padding: '1rem 0', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <Link href="/" style={{ fontWeight: 'bold', textDecoration: 'none', color: '#7c3aed' }}>
          Image Optimization
        </Link>
        <Link href="/gallery" style={{ textDecoration: 'none', color: '#6b7280' }}>Gallery</Link>
        <Link href="/about" style={{ textDecoration: 'none', color: '#6b7280' }}>About</Link>
      </header>
      <main style={{ padding: '2rem 0' }}>{children}</main>
    </div>
  );
}
