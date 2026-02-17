const routes = [
  { pattern: '/', type: 'Static', file: 'routes/page.tsx', example: '/' },
  { pattern: '/about', type: 'Static', file: 'routes/about/page.tsx', example: '/about' },
  { pattern: '/products/[id]', type: 'Dynamic', file: 'routes/products/[id]/page.tsx', example: '/products/42' },
  { pattern: '/docs/[...path]', type: 'Catch-all', file: 'routes/docs/[...path]/page.tsx', example: '/docs/a/b/c' },
  { pattern: '/login', type: 'Route Group (auth)', file: 'routes/(auth)/login/page.tsx', example: '/login' },
  { pattern: '/register', type: 'Route Group (auth)', file: 'routes/(auth)/register/page.tsx', example: '/register' },
];

export default function Home() {
  return (
    <div>
      <h1 style={{ marginBottom: '0.5rem' }}>Routing Showcase</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
        Every routing pattern Pyra supports, each with a live example you can visit.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
            <th style={{ padding: '0.75rem 1rem', borderBottom: '2px solid #e5e7eb' }}>URL Pattern</th>
            <th style={{ padding: '0.75rem 1rem', borderBottom: '2px solid #e5e7eb' }}>Type</th>
            <th style={{ padding: '0.75rem 1rem', borderBottom: '2px solid #e5e7eb' }}>Source File</th>
            <th style={{ padding: '0.75rem 1rem', borderBottom: '2px solid #e5e7eb' }}>Try it</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((r) => (
            <tr key={r.pattern}>
              <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', fontFamily: 'monospace', color: '#dc2626' }}>
                {r.pattern}
              </td>
              <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>{r.type}</td>
              <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', fontFamily: 'monospace', fontSize: '0.8rem', color: '#9ca3af' }}>
                {r.file}
              </td>
              <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6' }}>
                <a href={r.example} style={{ color: '#2563eb' }}>{r.example}</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
