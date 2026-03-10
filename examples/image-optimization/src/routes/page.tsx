import { Image, Link } from '@pyra-js/adapter-react';

const images = [
  { src: '/hero.jpg', alt: 'Mountain landscape', width: 1440, height: 960 },
  { src: '/portrait.jpg', alt: 'Person portrait', width: 960, height: 1280 },
  { src: '/product.jpg', alt: 'Product shot', width: 800, height: 800 },
];

export default function Home() {
  return (
    <div>
      <h1>Pyra Image Optimization</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
        The <code>&lt;Image&gt;</code> component generates a <code>&lt;picture&gt;</code> element
        with <code>&lt;source&gt;</code> tags for modern formats (WebP, AVIF) and a fallback{' '}
        <code>&lt;img&gt;</code>. In dev, images are optimized on-demand via the{' '}
        <code>/_pyra/image</code> endpoint. In production, variants are pre-built at{' '}
        <code>pyra build</code> time.
      </p>

      <h2>Example images</h2>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Add <code>hero.jpg</code>, <code>portrait.jpg</code>, and <code>product.jpg</code> to the{' '}
        <code>public/</code> directory to see these render. The plugin auto-discovers all images in{' '}
        <code>public/</code> at build time.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {images.map(({ src, alt, width, height }) => (
          <figure key={src} style={{ margin: 0 }}>
            <Image
              src={src}
              alt={alt}
              width={width}
              height={height}
              sizes="(max-width: 600px) 100vw, 480px"
              style={{ width: '100%', height: 'auto', borderRadius: '8px', display: 'block' }}
            />
            <figcaption style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#9ca3af', fontFamily: 'monospace' }}>
              {src}
            </figcaption>
          </figure>
        ))}
      </div>

      <h2 style={{ marginTop: '2.5rem' }}>How it works</h2>
      <ol style={{ lineHeight: 1.9, color: '#374151' }}>
        <li>
          Add <code>pyraImages()</code> to the <code>plugins</code> array in{' '}
          <code>pyra.config.ts</code> and install <code>sharp</code>.
        </li>
        <li>
          Place source images in <code>public/</code> (JPEG, PNG, WebP, AVIF supported).
        </li>
        <li>
          Use the <code>&lt;Image&gt;</code> component from <code>@pyra-js/adapter-react</code>.
          Pass <code>src</code>, <code>alt</code>, <code>width</code>, and optionally{' '}
          <code>sizes</code> and <code>quality</code>.
        </li>
        <li>
          <strong>Dev:</strong> images are converted on-demand and cached for 60 s in memory.
        </li>
        <li>
          <strong>Prod:</strong> <code>pyra build</code> pre-generates every size/format variant
          and records them in <code>dist/manifest.json</code>.
        </li>
      </ol>

      <Link href="/gallery" style={{ display: 'inline-block', marginTop: '1.5rem', color: '#7c3aed' }}>
        View the full gallery &rarr;
      </Link>
    </div>
  );
}
