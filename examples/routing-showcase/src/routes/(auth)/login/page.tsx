export default function Login() {
  return (
    <div>
      <h1>Login</h1>
      <p>
        This page lives at <code>src/routes/(auth)/login/page.tsx</code> but is served at{' '}
        <code>/login</code>.
      </p>
      <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
        Route groups wrap a folder name in parentheses — e.g. <code>(auth)</code> — so you can
        organise related routes together without adding a URL segment. The group name is stripped
        from every URL inside it.
      </p>
      <a href="/register" style={{ color: '#2563eb' }}>Go to Register →</a>
      <br />
      <a href="/" style={{ color: '#6b7280', marginTop: '0.5rem', display: 'inline-block' }}>← Home</a>
    </div>
  );
}
