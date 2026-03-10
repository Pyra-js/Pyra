import { Image, Link } from '@pyra-js/adapter-react';

// A wider set of images to show the responsive picture/source behaviour.
const gallery = [
  { src: '/hero.jpg', alt: 'Mountain landscape', caption: 'Landscape — wide aspect ratio' },
  { src: '/portrait.jpg', alt: 'Person portrait', caption: 'Portrait — tall aspect ratio' },
  { src: '/product.jpg', alt: 'Product shot', caption: 'Product — square crop' },
  { src: '/hero.jpg', alt: 'Mountain landscape (small)', caption: 'Same source, smaller display size' },
];

export default function Gallery() {
  return (
    <div>
      <h1>Gallery</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
        Each <code>&lt;Image&gt;</code> below renders a <code>&lt;picture&gt;</code> with AVIF and
        WebP <code>&lt;source&gt;</code> tags. Open DevTools → Network and filter by "image" to
        see which format your browser requests.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '2rem' }}>
        {gallery.map(({ src, alt, caption }, i) => (
          <figure key={i} style={{ margin: 0, background: '#f9fafb', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
            <Image
              src={src}
              alt={alt}
              width={960}
              height={640}
              // sizes tells the browser how wide this image will be at each breakpoint.
              // The plugin generates the closest matching pre-built variant.
              sizes="(max-width: 768px) 100vw, 300px"
              quality={85}
              style={{ width: '100%', height: '200px', objectFit: 'cover', display: 'block' }}
            />
            <figcaption style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#6b7280' }}>
              {caption}
            </figcaption>
          </figure>
        ))}
      </div>

      <Link href="/" style={{ display: 'inline-block', marginTop: '2rem', color: '#7c3aed' }}>
        &larr; Back to home
      </Link>
    </div>
  );
}
