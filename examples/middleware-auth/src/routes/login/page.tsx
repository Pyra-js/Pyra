export default function LoginPage() {
  return (
    <div>
      <h1>Login</h1>
      <p style={{ color: '#6b7280' }}>
        There is no HTML form here — auth is handled entirely via API routes to keep the
        example focused on the middleware, not the UI.
      </p>
      <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: '1.25rem', borderRadius: '6px', fontSize: '0.85rem' }}>
        {'# Log in (sets session cookie)\n'}
        {"curl -c cookies.txt -X POST http://localhost:3000/api/login \\\n"}
        {"     -H 'Content-Type: application/json' \\\n"}
        {"     -d '{\"user\":\"alice\"}'\n\n"}
        {'# Now hit the protected endpoint with the cookie\n'}
        {'curl -b cookies.txt http://localhost:3000/dashboard\n\n'}
        {'# Log out\n'}
        {'curl -b cookies.txt http://localhost:3000/api/logout'}
      </pre>
      <p style={{ marginTop: '1rem' }}>
        Or just click <a href="/api/login-demo" style={{ color: '#2563eb' }}>this demo link</a>{' '}
        which logs you in via a GET redirect for convenience (not for production).
      </p>
    </div>
  );
}
