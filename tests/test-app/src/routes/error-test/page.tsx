import type { RequestContext } from 'pyrajs-shared';

export async function load(ctx: RequestContext) {
  throw new Error('Intentional load error');
}

export default function ErrorTestPage({ data }: { data: string }) {
  return <div>This should not render: {data}</div>;
}
