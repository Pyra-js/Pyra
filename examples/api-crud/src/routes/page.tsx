const endpoints = [
  { method: 'GET', path: '/api/items', desc: 'List all items' },
  { method: 'POST', path: '/api/items', desc: 'Create an item — body: { name, value }' },
  { method: 'GET', path: '/api/items/:id', desc: 'Get a single item by id' },
  { method: 'PUT', path: '/api/items/:id', desc: 'Update an item — body: { name?, value? }' },
  { method: 'DELETE', path: '/api/items/:id', desc: 'Delete an item' },
  { method: 'GET', path: '/api/echo/*', desc: 'Echo the catch-all path back as JSON' },
];

const methodColors: Record<string, string> = {
  GET: '#16a34a',
  POST: '#2563eb',
  PUT: '#d97706',
  DELETE: '#dc2626',
};

export default function ApiExplorer() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '800px', margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>API CRUD Explorer</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
        This app has no UI beyond this page — all logic lives in API routes under{' '}
        <code>src/routes/api/</code>. Use your browser dev tools, curl, or a REST client to
        exercise each endpoint.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
            <th style={{ padding: '0.75rem 1rem', borderBottom: '2px solid #e5e7eb', width: '6rem' }}>Method</th>
            <th style={{ padding: '0.75rem 1rem', borderBottom: '2px solid #e5e7eb' }}>Path</th>
            <th style={{ padding: '0.75rem 1rem', borderBottom: '2px solid #e5e7eb' }}>Description</th>
          </tr>
        </thead>
        <tbody>
          {endpoints.map((e) => (
            <tr key={e.method + e.path}>
              <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  color: methodColors[e.method] ?? '#374151',
                }}>
                  {e.method}
                </span>
              </td>
              <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                {e.path}
              </td>
              <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontSize: '0.875rem' }}>
                {e.desc}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: '2.5rem' }}>Quick test with curl</h2>
      <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: '1.25rem', borderRadius: '6px', overflowX: 'auto', fontSize: '0.85rem', lineHeight: 1.6 }}>
        {[
          '# List items',
          'curl http://localhost:3000/api/items',
          '',
          '# Create an item',
          "curl -X POST http://localhost:3000/api/items \\",
          "     -H 'Content-Type: application/json' \\",
          "     -d '{\"name\":\"Delta\",\"value\":400}'",
          '',
          '# Update item 1',
          "curl -X PUT http://localhost:3000/api/items/1 \\",
          "     -H 'Content-Type: application/json' \\",
          "     -d '{\"value\":999}'",
          '',
          '# Delete item 2',
          'curl -X DELETE http://localhost:3000/api/items/2',
          '',
          '# Catch-all echo',
          'curl http://localhost:3000/api/echo/foo/bar/baz',
        ].join('\n')}
      </pre>
    </div>
  );
}
