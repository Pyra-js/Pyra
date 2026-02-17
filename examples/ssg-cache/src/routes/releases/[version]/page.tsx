import type { RequestContext } from 'pyrajs-shared';
import type { Release } from '../../../data/releases.js';

/**
 * Dynamic SSG — prerender.paths() returns the list of param objects
 * Pyra should pre-render at build time. One HTML file is produced per entry.
 */
export const prerender = {
  paths() {
    return [{ version: '1.0' }, { version: '1.1' }, { version: '2.0' }];
  },
};

export async function load(ctx: RequestContext) {
  const { getRelease } = await import('../../../data/releases.js');
  const release = getRelease(ctx.params.version);
  if (!release) throw new Error(`Release ${ctx.params.version} not found`);
  return { release };
}

export default function ReleasePage({ release }: { release: Release }) {
  return (
    <div>
      <h1>Release {release.version}</h1>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Released on {release.date}</p>
      <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Highlights</h2>
      <ul style={{ lineHeight: 1.8 }}>
        {release.highlights.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      <p style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: '#9ca3af' }}>
        This page was pre-rendered at build time. Its siblings — version 1.0, 1.1, and 2.0 — are
        all static HTML files written to <code>dist/client/releases/</code>.
      </p>
      <nav style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
        <a href="/releases/1.0" style={{ color: '#0891b2' }}>1.0</a>
        <a href="/releases/1.1" style={{ color: '#0891b2' }}>1.1</a>
        <a href="/releases/2.0" style={{ color: '#0891b2' }}>2.0</a>
        <a href="/" style={{ color: '#6b7280' }}>← Home</a>
      </nav>
    </div>
  );
}
