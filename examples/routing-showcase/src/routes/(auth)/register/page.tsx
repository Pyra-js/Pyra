export default function Register() {
  return (
    <div>
      <h1>Register</h1>
      <p>
        This page lives at <code>src/routes/(auth)/register/page.tsx</code> but is served at{' '}
        <code>/register</code>.
      </p>
      <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
        Both <code>/login</code> and <code>/register</code> share the <code>(auth)</code> group so
        they can share a nested layout or middleware in the future, while staying at top-level URLs.
      </p>
      <a href="/login" style={{ color: '#2563eb' }}>← Login</a>
      <br />
      <a href="/" style={{ color: '#6b7280', marginTop: '0.5rem', display: 'inline-block' }}>← Home</a>
    </div>
  );
}
