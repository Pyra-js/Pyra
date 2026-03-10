import { Link } from '@pyra-js/adapter-react';

export const prerender = true;

export default function About() {
  return (
    <div>
      <h1>About</h1>
      <p>
        This example demonstrates the <strong>Pyra image optimization</strong> system, which has
        two parts:
      </p>

      <h2>1. <code>pyraImages()</code> plugin</h2>
      <p>
        Registered in <code>pyra.config.ts</code>. Accepts <code>formats</code>,{' '}
        <code>sizes</code>, and <code>quality</code> options.
      </p>
      <ul>
        <li><strong>Dev</strong> — activates the <code>/_pyra/image</code> on-demand endpoint. Images are processed by <code>sharp</code> on first request and cached for 60 s.</li>
        <li><strong>Build</strong> — scans <code>public/</code>, generates every size × format combination, writes variants to <code>dist/client/_images/</code>, and merges metadata into <code>dist/manifest.json</code>.</li>
        <li><strong>Prod</strong> — <code>/_pyra/image</code> serves pre-built variants from the manifest with immutable <code>Cache-Control</code> headers.</li>
      </ul>

      <h2>2. <code>&lt;Image&gt;</code> component</h2>
      <p>
        Imported from <code>@pyra-js/adapter-react</code>. Generates a <code>&lt;picture&gt;</code>{' '}
        element with <code>&lt;source&gt;</code> tags for each modern format, ordered from smallest
        to largest so the browser picks the best supported format, then a fallback{' '}
        <code>&lt;img&gt;</code> targeting the original format.
      </p>
      <p>Props: <code>src</code>, <code>alt</code>, <code>width</code>, <code>height</code>, <code>sizes</code>, <code>quality</code>, and any standard <code>img</code> attribute.</p>

      <h2>Requirements</h2>
      <ul>
        <li><code>sharp &gt;=0.33.0</code> must be installed (optional peer dep of <code>@pyra-js/core</code>).</li>
        <li>Source images must be in the <code>public/</code> directory.</li>
      </ul>

      <Link href="/" style={{ display: 'inline-block', marginTop: '1.5rem', color: '#7c3aed' }}>
        &larr; Back to home
      </Link>
    </div>
  );
}
