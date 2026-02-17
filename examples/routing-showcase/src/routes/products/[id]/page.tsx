import type { RequestContext } from 'pyrajs-shared';

export async function load(ctx: RequestContext) {
  const { id } = ctx.params;
  // Simulate a data fetch using the dynamic param
  return {
    id,
    name: `Product #${id}`,
    price: (parseInt(id, 10) * 7.99).toFixed(2),
    inStock: parseInt(id, 10) % 3 !== 0,
  };
}

export default function ProductDetail({
  id,
  name,
  price,
  inStock,
}: {
  id: string;
  name: string;
  price: string;
  inStock: boolean;
}) {
  return (
    <div>
      <h1>{name}</h1>
      <p>
        The dynamic segment <code>[id]</code> in{' '}
        <code>src/routes/products/[id]/page.tsx</code> captured:{' '}
        <strong style={{ fontFamily: 'monospace', color: '#dc2626' }}>{id}</strong>
      </p>
      <dl style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '0.5rem 1.5rem' }}>
        <dt style={{ color: '#6b7280' }}>Price</dt>
        <dd style={{ margin: 0 }}>${price}</dd>
        <dt style={{ color: '#6b7280' }}>In stock</dt>
        <dd style={{ margin: 0 }}>{inStock ? '✓ Yes' : '✗ No'}</dd>
        <dt style={{ color: '#6b7280' }}>Route param</dt>
        <dd style={{ margin: 0, fontFamily: 'monospace' }}>ctx.params.id = "{id}"</dd>
      </dl>
      <nav style={{ marginTop: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <a href="/products/1" style={{ color: '#2563eb' }}>Product 1</a>
        <a href="/products/42" style={{ color: '#2563eb' }}>Product 42</a>
        <a href="/products/100" style={{ color: '#2563eb' }}>Product 100</a>
        <a href="/" style={{ color: '#6b7280' }}>← Home</a>
      </nav>
    </div>
  );
}
