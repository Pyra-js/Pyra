import type { ErrorPageProps } from 'pyrajs-shared';

export default function ErrorPage({ message, statusCode, pathname, stack }: ErrorPageProps) {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '3rem', color: '#ef4444' }}>{statusCode}</h1>
      <h2>Something went wrong</h2>
      <p style={{ color: '#6b7280' }}>{message}</p>
      <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Path: {pathname}</p>
      {stack && (
        <pre style={{ textAlign: 'left', background: '#f9fafb', padding: '1rem', borderRadius: '0.5rem', overflow: 'auto', fontSize: '0.75rem', marginTop: '1rem' }}>
          {stack}
        </pre>
      )}
      <a href="/" style={{ color: '#ef4444', marginTop: '1rem', display: 'inline-block' }}>Go home</a>
    </div>
  );
}
