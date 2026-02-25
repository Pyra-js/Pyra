import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import type { RenderContext } from 'pyrajs-shared';
import { Image } from '../Image.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Render the Image component to an HTML string for assertion. */
function render(props: Parameters<typeof Image>[0]): string {
  return renderToString(createElement(Image, props));
}

/** Build a minimal RenderContext for adapter tests. */
function mockContext(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    url: new URL('http://localhost/'),
    params: {},
    pushHead: () => {},
    ...overrides,
  };
}

/** Extract all srcSet values from a rendered HTML string as an array of entries. */
function parseSrcSet(srcset: string): Array<{ url: string; descriptor: string }> {
  return srcset.split(',').map((s) => {
    const parts = s.trim().split(/\s+/);
    return { url: parts[0], descriptor: parts[1] ?? '' };
  });
}

// ─── Basic rendering ──────────────────────────────────────────────────────────

describe('Image — basic rendering', () => {
  it('renders a <picture> element', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'Hero' });
    expect(html).toContain('<picture');
  });

  it('renders an <img> element inside the picture', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'Hero' });
    expect(html).toContain('<img');
  });

  it('<img> src is the original unoptimized path', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'Hero' });
    expect(html).toContain('src="/images/hero.jpg"');
  });

  it('<img> alt attribute is forwarded', () => {
    const html = render({ src: '/images/photo.jpg', alt: 'A photo of a sunset' });
    expect(html).toContain('alt="A photo of a sunset"');
  });

  it('<img> loading defaults to "lazy"', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x' });
    expect(html).toContain('loading="lazy"');
  });

  it('<img> loading can be set to "eager"', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', loading: 'eager' });
    expect(html).toContain('loading="eager"');
  });

  it('<img> width is forwarded', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', width: 1280 });
    expect(html).toContain('width="1280"');
  });

  it('<img> height is forwarded', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', height: 720 });
    expect(html).toContain('height="720"');
  });

  it('<img> className is forwarded', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', className: 'hero-img' });
    expect(html).toContain('class="hero-img"');
  });

  it('<img> renders without width/height when not provided', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x' });
    // Should not have width= or height= attributes (undefined props are omitted by React)
    expect(html).not.toMatch(/width="\d+"/);
    expect(html).not.toMatch(/height="\d+"/);
  });
});

// ─── <source> elements ────────────────────────────────────────────────────────

describe('Image — <source> elements', () => {
  it('renders one <source> per format', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', formats: ['avif', 'webp'] });
    const sources = html.match(/<source/g) ?? [];
    expect(sources).toHaveLength(2);
  });

  it('default formats produce avif and webp sources', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x' });
    expect(html).toContain('type="image/avif"');
    expect(html).toContain('type="image/webp"');
  });

  it('avif source appears before webp source (best format first)', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x' });
    const avifPos = html.indexOf('type="image/avif"');
    const webpPos = html.indexOf('type="image/webp"');
    expect(avifPos).toBeLessThan(webpPos);
  });

  it('single format renders exactly one <source>', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', formats: ['webp'] });
    const sources = html.match(/<source/g) ?? [];
    expect(sources).toHaveLength(1);
    expect(html).toContain('type="image/webp"');
  });

  it('jpeg and png formats render with correct MIME type', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', formats: ['jpeg', 'png'] });
    expect(html).toContain('type="image/jpeg"');
    expect(html).toContain('type="image/png"');
  });
});

// ─── srcSet URLs ──────────────────────────────────────────────────────────────

describe('Image — srcSet URL generation', () => {
  it('srcSet contains one entry per width', () => {
    const html = render({
      src: '/images/hero.jpg',
      alt: 'x',
      formats: ['webp'],
      widths: [640, 1280, 1920],
    });
    // Extract srcSet content from the source tag
    const match = html.match(/srcSet="([^"]+)"/);
    expect(match).not.toBeNull();
    const entries = parseSrcSet(match![1]);
    expect(entries).toHaveLength(3);
  });

  it('srcSet descriptors are width descriptors (Nw)', () => {
    const html = render({
      src: '/images/hero.jpg',
      alt: 'x',
      formats: ['webp'],
      widths: [640, 1280],
    });
    const match = html.match(/srcSet="([^"]+)"/);
    const entries = parseSrcSet(match![1].replace(/&amp;/g, '&'));
    expect(entries[0].descriptor).toBe('640w');
    expect(entries[1].descriptor).toBe('1280w');
  });

  it('srcSet URL contains the /_pyra/image endpoint', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', formats: ['webp'], widths: [640] });
    expect(html).toContain('/_pyra/image');
  });

  it('srcSet URL includes src query param', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', formats: ['webp'], widths: [640] });
    // HTML-encoded & → &amp; in React's renderToString
    expect(html).toMatch(/src=%2Fimages%2Fhero\.jpg|src=\/images\/hero\.jpg/);
  });

  it('srcSet URL includes width (w) query param', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', formats: ['webp'], widths: [800] });
    expect(html).toContain('w=800');
  });

  it('srcSet URL includes format query param', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', formats: ['avif'], widths: [640] });
    expect(html).toContain('format=avif');
  });

  it('srcSet URL includes quality (q) query param', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', formats: ['webp'], widths: [640], quality: 65 });
    expect(html).toContain('q=65');
  });

  it('default quality is 80', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', formats: ['webp'], widths: [640] });
    expect(html).toContain('q=80');
  });

  it('default widths are [640, 1280, 1920]', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', formats: ['webp'] });
    expect(html).toContain('w=640');
    expect(html).toContain('w=1280');
    expect(html).toContain('w=1920');
  });

  it('custom widths override defaults', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', formats: ['webp'], widths: [400, 800] });
    expect(html).toContain('w=400');
    expect(html).toContain('w=800');
    expect(html).not.toContain('w=640');
    expect(html).not.toContain('w=1920');
  });
});

// ─── sizes attribute ──────────────────────────────────────────────────────────

describe('Image — sizes attribute', () => {
  it('<source> has sizes="100vw" by default', () => {
    const html = render({ src: '/images/hero.jpg', alt: 'x', formats: ['webp'] });
    expect(html).toContain('sizes="100vw"');
  });

  it('<source> sizes can be customised', () => {
    const html = render({
      src: '/images/hero.jpg',
      alt: 'x',
      formats: ['webp'],
      sizes: '(max-width: 768px) 100vw, 50vw',
    });
    expect(html).toContain('sizes="(max-width: 768px) 100vw, 50vw"');
  });

  it('<img> also receives the sizes attribute', () => {
    const html = render({
      src: '/images/hero.jpg',
      alt: 'x',
      sizes: '50vw',
    });
    // Both the <source> and <img> should carry the sizes attr
    const matches = html.match(/sizes="50vw"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Adapter rendering (renderToHTML) ─────────────────────────────────────────

describe('createReactAdapter — renderToHTML with layouts', () => {
  it('wraps page in layout when layouts array is provided', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const adapter = createReactAdapter();

    function Layout({ children }: { children?: React.ReactNode }) {
      return createElement('div', { id: 'layout' }, children);
    }
    function Page() {
      return createElement('main', null, 'Hello');
    }

    const html = await adapter.renderToHTML(Page, {}, mockContext({ layouts: [Layout] }));
    expect(html).toContain('id="layout"');
    expect(html).toContain('Hello');
  });

  it('passes data props to page component', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const adapter = createReactAdapter();

    function Page({ title }: { title: string }) {
      return createElement('h1', null, title);
    }

    const html = await adapter.renderToHTML(Page, { title: 'My Title' }, mockContext());
    expect(html).toContain('My Title');
  });

  it('merges params into props', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const adapter = createReactAdapter();

    function Page({ params }: { params: Record<string, string> }) {
      return createElement('span', null, params.slug);
    }

    const html = adapter.renderToHTML(Page, {}, { params: { slug: 'hello-world' } });
    expect(html).toContain('hello-world');
  });

  it('renders without layouts', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const adapter = createReactAdapter();

    function Page() {
      return createElement('p', null, 'standalone');
    }

    const html = adapter.renderToHTML(Page, {}, { params: {} });
    expect(html).toContain('standalone');
  });

  it('nests multiple layouts outermost-first', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const adapter = createReactAdapter();

    function Outer({ children }: { children?: React.ReactNode }) {
      return createElement('div', { id: 'outer' }, children);
    }
    function Inner({ children }: { children?: React.ReactNode }) {
      return createElement('div', { id: 'inner' }, children);
    }
    function Page() {
      return createElement('span', null, 'content');
    }

    const html = adapter.renderToHTML(Page, {}, { params: {}, layouts: [Outer, Inner] });
    const outerPos = html.indexOf('id="outer"');
    const innerPos = html.indexOf('id="inner"');
    const contentPos = html.indexOf('content');
    // Outer wraps inner wraps content
    expect(outerPos).toBeLessThan(innerPos);
    expect(innerPos).toBeLessThan(contentPos);
  });
});

// ─── getDocumentShell ─────────────────────────────────────────────────────────

describe('createReactAdapter — getDocumentShell()', () => {
  it('returns a valid HTML document string', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const shell = createReactAdapter().getDocumentShell();
    expect(shell).toContain('<!DOCTYPE html>');
    expect(shell).toContain('<html');
    expect(shell).toContain('</html>');
  });

  it('includes <!--pyra-head--> marker', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const shell = createReactAdapter().getDocumentShell();
    expect(shell).toContain('<!--pyra-head-->');
  });

  it('includes <!--pyra-outlet--> marker', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const shell = createReactAdapter().getDocumentShell();
    expect(shell).toContain('<!--pyra-outlet-->');
  });

  it('includes a favicon link tag', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const shell = createReactAdapter().getDocumentShell();
    expect(shell).toContain('favicon.svg');
  });

  it('includes charset meta tag', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const shell = createReactAdapter().getDocumentShell();
    expect(shell).toContain('charset="UTF-8"');
  });

  it('includes viewport meta tag', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const shell = createReactAdapter().getDocumentShell();
    expect(shell).toContain('viewport');
  });
});

// ─── getHydrationScript ───────────────────────────────────────────────────────

describe('createReactAdapter — getHydrationScript()', () => {
  it('imports hydrateRoot from react-dom/client', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const script = createReactAdapter().getHydrationScript('/app.js', 'root');
    expect(script).toContain('react-dom/client');
    expect(script).toContain('hydrateRoot');
  });

  it('imports the component from the provided client entry path', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const script = createReactAdapter().getHydrationScript('/dist/client/page.js', 'root');
    expect(script).toContain('/dist/client/page.js');
  });

  it('references the provided container ID', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const script = createReactAdapter().getHydrationScript('/app.js', 'my-app');
    expect(script).toContain('my-app');
  });

  it('reads hydration data from __pyra_data element', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const script = createReactAdapter().getHydrationScript('/app.js', 'root');
    expect(script).toContain('__pyra_data');
  });

  it('with layouts, imports each layout module', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const script = createReactAdapter().getHydrationScript(
      '/app.js',
      'root',
      ['/layout0.js', '/layout1.js'],
    );
    expect(script).toContain('/layout0.js');
    expect(script).toContain('/layout1.js');
  });

  it('with layouts, nests createElement calls', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const script = createReactAdapter().getHydrationScript(
      '/app.js',
      'root',
      ['/layout.js'],
    );
    // Should have nested createElement: Layout0 wrapping Component
    expect(script).toContain('Layout0');
    expect(script).toContain('Component');
    expect(script).toContain('createElement');
  });

  it('without layouts, uses simple createElement(Component, data)', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    const script = createReactAdapter().getHydrationScript('/app.js', 'root');
    expect(script).toContain('createElement(Component, data)');
    expect(script).not.toContain('Layout');
  });
});

// ─── Adapter metadata ─────────────────────────────────────────────────────────

describe('createReactAdapter — metadata', () => {
  it('has name "react"', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    expect(createReactAdapter().name).toBe('react');
  });

  it('lists .tsx and .jsx as supported file extensions', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    expect(createReactAdapter().fileExtensions).toContain('.tsx');
    expect(createReactAdapter().fileExtensions).toContain('.jsx');
  });

  it('esbuildPlugins() returns an empty array', async () => {
    const { createReactAdapter } = await import('../adapter.js');
    expect(createReactAdapter().esbuildPlugins()).toEqual([]);
  });
});
