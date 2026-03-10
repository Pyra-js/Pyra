import { Link } from '@pyra-js/adapter-react';
import type { RequestContext } from '@pyra-js/cli';

export async function load(ctx: RequestContext) {
  // By the time load() runs, the middleware has already confirmed the session exists.
  const user = ctx.cookies.get('session') ?? 'unknown';
  return { user };
}

export default function Dashboard({ user }: { user: string }) {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>
        Welcome, <strong>{user}</strong>! You reached this page because the{' '}
        <code>dashboard/middleware.ts</code> found a valid <code>session</code> cookie and called{' '}
        <code>next()</code>.
      </p>
      <p style={{ marginTop: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>
        The root middleware also fired — check <code>X-Request-Id</code> and{' '}
        <code>X-Response-Time</code> in the response headers (DevTools → Network).
      </p>
      <Link href="/" style={{ color: '#7c3aed' }}>← Home</Link>
    </div>
  );
}
