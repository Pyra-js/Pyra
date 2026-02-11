import type { ErrorPageProps } from 'pyrajs-shared';

export default function ErrorBoundary({ message, statusCode, pathname, stack }: ErrorPageProps) {
  return (
    <div className="error-boundary">
      <h1>Error {statusCode}</h1>
      <p className="error-message">{message}</p>
      <p className="error-path">Path: {pathname}</p>
      {stack && <pre className="error-stack">{stack}</pre>}
    </div>
  );
}
