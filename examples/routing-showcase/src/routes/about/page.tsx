export default function About() {
  return (
    <div>
      <h1>About</h1>
      <p>
        This is a <strong>static route</strong> — no dynamic segments. The file{' '}
        <code>src/routes/about/page.tsx</code> maps directly to the URL <code>/about</code>.
      </p>
      <p style={{ color: '#6b7280', marginTop: '1rem' }}>
        Static routes are matched with the highest priority in the trie: they win over dynamic
        and catch-all segments at the same path depth.
      </p>
      <a href="/" style={{ color: '#2563eb' }}>← Home</a>
    </div>
  );
}
