import type { RequestContext } from 'pyrajs-shared';

export async function load(_ctx: RequestContext) {
  // SSR — rendered fresh on every request. No prerender export.
  return { renderedAt: new Date().toISOString() };
}

export default function Home({ renderedAt }: { renderedAt: string }) {
  return (
    <div>
      <h1>SSG & Cache Example</h1>
      <p style={{ color: '#6b7280' }}>
        This page is <strong>SSR</strong> — rendered on every request. Refresh to see the
        timestamp change.
      </p>
      <p style={{ fontFamily: 'monospace', color: '#0891b2' }}>Rendered at: {renderedAt}</p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '2rem' }}>
        <thead>
          <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
            <th style={{ padding: '0.75rem 1rem', borderBottom: '2px solid #e5e7eb' }}>Route</th>
            <th style={{ padding: '0.75rem 1rem', borderBottom: '2px solid #e5e7eb' }}>Mode</th>
            <th style={{ padding: '0.75rem 1rem', borderBottom: '2px solid #e5e7eb' }}>What to check</th>
          </tr>
        </thead>
        <tbody>
          {[
            { path: '/', mode: 'SSR', check: 'Timestamp changes on every refresh' },
            { path: '/about', mode: 'SSG (static)', check: 'prerender = true — built once, served as static HTML' },
            { path: '/releases/1.0', mode: 'SSG (dynamic)', check: 'prerender.paths() — 3 HTML files built at pyra build time' },
            { path: '/live', mode: 'SSR + Cache', check: 'Cache-Control: public, max-age=30 header in response' },
          ].map((r) => (
            <tr key={r.path}>
              <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6' }}>
                <a href={r.path} style={{ color: '#0891b2', fontFamily: 'monospace' }}>{r.path}</a>
              </td>
              <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontSize: '0.875rem' }}>{r.mode}</td>
              <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', color: '#374151', fontSize: '0.875rem' }}>{r.check}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
