export default function NotFound() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '4rem', color: '#d1d5db' }}>404</h1>
      <h2>Page Not Found</h2>
      <p style={{ color: '#6b7280' }}>The page you're looking for doesn't exist.</p>
      <a href="/" style={{ color: '#ef4444', marginTop: '1rem', display: 'inline-block' }}>Go home</a>
    </div>
  );
}
