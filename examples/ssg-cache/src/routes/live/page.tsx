import type { RequestContext, CacheConfig } from 'pyrajs-shared';

/**
 * SSR page with cache hints.
 * `export const cache` is read by the build system and the prod server to
 * emit a Cache-Control header on every response from this route.
 * In dev mode the header is still set so you can inspect it in DevTools.
 */
export const cache: CacheConfig = {
  maxAge: 30,              // browsers may cache for 30 s
  sMaxAge: 60,             // CDNs may cache for 60 s
  staleWhileRevalidate: 120, // CDNs may serve stale while revalidating for 2 min
};

export async function load(_ctx: RequestContext) {
  return { renderedAt: new Date().toISOString() };
}

export default function Live({ renderedAt }: { renderedAt: string }) {
  return (
    <div>
      <h1>Live (SSR + Cache)</h1>
      <p style={{ color: '#6b7280' }}>
        This page is server-rendered on every request but instructs the browser (and any CDN) to
        cache the response using the exported <code>cache</code> config.
      </p>
      <p style={{ fontFamily: 'monospace', color: '#0891b2', margin: '1rem 0' }}>
        Rendered at: {renderedAt}
      </p>
      <pre style={{ background: '#f9fafb', padding: '1rem', borderRadius: '6px', fontSize: '0.85rem', borderLeft: '4px solid #0891b2' }}>
        {`Cache-Control: public, max-age=30, s-maxage=60, stale-while-revalidate=120`}
      </pre>
      <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#9ca3af' }}>
        Open DevTools → Network, then hard-refresh to confirm the header. Subsequent soft
        refreshes within 30 s will be served from browser cache.
      </p>
      <a href="/" style={{ color: '#0891b2' }}>← Home</a>
    </div>
  );
}
