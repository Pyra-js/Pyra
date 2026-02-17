export default function Home() {
  return (
    <div>
      <h1>Middleware Auth Example</h1>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem' }}>How it works</h2>
        <ol style={{ lineHeight: 1.8, color: '#374151' }}>
          <li>
            <strong>Root middleware</strong> (<code>src/routes/middleware.ts</code>) runs on every
            request. It measures elapsed time and stamps <code>X-Request-Id</code> and{' '}
            <code>X-Response-Time</code> onto the response.
          </li>
          <li>
            <strong>Dashboard middleware</strong> (<code>src/routes/dashboard/middleware.ts</code>)
            runs only for routes under <code>/dashboard</code>. It reads the{' '}
            <code>session</code> cookie — if absent it short-circuits and returns a 401 JSON
            response without calling <code>next()</code>.
          </li>
          <li>
            The <strong>login API</strong> (<code>POST /api/login</code>) sets a{' '}
            <code>session</code> cookie and redirects home. The <strong>logout API</strong> (
            <code>GET /api/logout</code>) clears it.
          </li>
        </ol>
      </section>

      <section style={{ marginTop: '1.5rem', padding: '1rem', background: '#f5f3ff', borderRadius: '6px', borderLeft: '4px solid #7c3aed' }}>
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#5b21b6' }}>
          Open DevTools → Network, then navigate to <a href="/dashboard" style={{ color: '#7c3aed' }}>/dashboard</a>.
          Without a session cookie you'll get a 401 — with one, you'll reach the page.
          Check the response headers for <code>X-Request-Id</code> to see the root middleware fire.
        </p>
      </section>
    </div>
  );
}
