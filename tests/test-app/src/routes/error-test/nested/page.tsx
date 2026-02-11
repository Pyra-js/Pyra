import type { RequestContext } from 'pyrajs-shared';

export async function load(ctx: RequestContext) {
  throw new Error('Nested load error');
}

export default function NestedErrorPage({ data }: { data: string }) {
  return <div>This should not render: {data}</div>;
}
