import type { ErrorPageProps } from 'pyrajs-shared';

export default function NestedErrorBoundary({ message, statusCode, pathname }: ErrorPageProps) {
  return (
    <div className="nested-error-boundary">
      <h1>Nested Error {statusCode}</h1>
      <p className="nested-error-message">{message}</p>
      <p className="nested-error-path">Path: {pathname}</p>
    </div>
  );
}
