/**
 * Static SSG page — `prerender = true` tells Pyra to render this page
 * once at build time and write the HTML to dist/client/about/index.html.
 * No server is involved at runtime; the file is served directly.
 */
export const prerender = true;

export default function About() {
  return (
    <div>
      <h1>About</h1>
      <p>
        This page was rendered <strong>at build time</strong> via{' '}
        <code>export const prerender = true</code>. In production it is served as a plain HTML
        file — no SSR, no Node.js process involved.
      </p>
      <p style={{ marginTop: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>
        In dev mode Pyra still renders it on-demand so you can edit freely. The static file is
        only produced during <code>pyra build</code>.
      </p>
      <a href="/" style={{ color: '#0891b2' }}>← Home</a>
    </div>
  );
}
