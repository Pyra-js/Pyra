import React from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav style={{ padding: '1rem', borderBottom: '1px solid #eee', display: 'flex', gap: '1rem' }}>
        <a href="/">Home</a>
        <a href="/about">About</a>
      </nav>
      <main style={{ padding: '2rem' }}>
        {children}
      </main>
      <footer style={{ padding: '1rem', borderTop: '1px solid #eee', textAlign: 'center', color: '#999' }}>
        {{PROJECT_NAME}} &mdash; built with Pyra.js
      </footer>
    </div>
  );
}
