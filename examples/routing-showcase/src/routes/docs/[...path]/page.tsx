import type { RequestContext } from 'pyrajs-shared';

export async function load(ctx: RequestContext) {
  const raw = ctx.params.path ?? '';
  const segments = raw ? raw.split('/').filter(Boolean) : [];
  return { raw, segments };
}

export default function DocsPage({ raw, segments }: { raw: string; segments: string[] }) {
  return (
    <div>
      <h1>Docs: /{raw || ''}</h1>
      <p>
        The catch-all segment <code>[...path]</code> in{' '}
        <code>src/routes/docs/[...path]/page.tsx</code> captured{' '}
        <strong>{segments.length}</strong> path segment(s).
      </p>
      <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
        The full value arrives as <code>ctx.params.path</code> — a single slash-joined string
        that you split however you need.
      </p>

      {segments.length > 0 && (
        <ol style={{ marginTop: '1rem', fontFamily: 'monospace' }}>
          {segments.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}

      <nav style={{ marginTop: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <a href="/docs/intro" style={{ color: '#2563eb' }}>/docs/intro</a>
        <a href="/docs/guides/getting-started" style={{ color: '#2563eb' }}>/docs/guides/getting-started</a>
        <a href="/docs/api/reference/v2/endpoints" style={{ color: '#2563eb' }}>/docs/api/reference/v2/endpoints</a>
        <a href="/" style={{ color: '#6b7280' }}>← Home</a>
      </nav>
    </div>
  );
}
