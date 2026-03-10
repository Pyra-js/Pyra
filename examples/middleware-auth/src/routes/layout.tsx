import React from 'react';
import { Link } from '@pyra-js/adapter-react';
import type { RequestContext } from '@pyra-js/cli';

export async function load(ctx: RequestContext) {
  const isLoggedIn = !!ctx.cookies.get('session');
  return { isLoggedIn };
}

export default function RootLayout({
  children,
  isLoggedIn,
}: {
  children: React.ReactNode;
  isLoggedIn: boolean;
}) {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '800px', margin: '0 auto', padding: '0 1rem' }}>
      <header style={{ borderBottom: '2px solid #e5e7eb', padding: '1rem 0', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <Link href="/" style={{ fontWeight: 'bold', textDecoration: 'none', color: '#7c3aed' }}>
          Middleware Auth
        </Link>
        <Link href="/dashboard" style={{ textDecoration: 'none', color: '#6b7280' }}>Dashboard (protected)</Link>
        <span style={{ marginLeft: 'auto', fontSize: '0.875rem', color: isLoggedIn ? '#16a34a' : '#9ca3af' }}>
          {isLoggedIn ? '● Logged in' : '○ Not logged in'}
        </span>
        {isLoggedIn ? (
          <a href="/api/logout" style={{ fontSize: '0.875rem', color: '#dc2626', textDecoration: 'none' }}>Log out</a>
        ) : (
          <Link href="/login" style={{ fontSize: '0.875rem', color: '#2563eb', textDecoration: 'none' }}>Log in</Link>
        )}
      </header>
      <main style={{ padding: '2rem 0' }}>{children}</main>
    </div>
  );
}
