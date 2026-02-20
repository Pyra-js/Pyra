# pyrajs-adapter-react

React adapter for Pyra.js. Wires React 18/19 into the Pyra SSR pipeline — server-side rendering with `renderToString()`, client-side hydration with `hydrateRoot()`, layout wrapping, and an `<Image>` component for responsive image optimization.

```bash
npm install pyrajs-adapter-react react react-dom
# or
pnpm add pyrajs-adapter-react react react-dom
```

**Peer dependencies:** `react ^18.0.0 || ^19.0.0` and `react-dom ^18.0.0 || ^19.0.0`

---

## Setup

Pass the adapter to your Pyra config:

```ts
// pyra.config.ts
import { defineConfig } from 'pyrajs-shared';
import { createReactAdapter } from 'pyrajs-adapter-react';

export default defineConfig({
  adapter: createReactAdapter(),
  routesDir: 'src/routes',
});
```

That's all the configuration required. The CLI (`pyra dev`, `pyra build`, `pyra start`) picks up the adapter automatically.

---

## Writing Pages

Create `page.tsx` files anywhere under `src/routes/`. The file's location determines the URL.

```tsx
// src/routes/blog/[slug]/page.tsx

export async function load(context) {
  const post = await fetchPost(context.params.slug);
  return { post };
}

export default function BlogPost({ post, params }) {
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </article>
  );
}
```

- **`load(context)`** — runs on the server before rendering. Whatever it returns is spread into the component's props. Route `params` are always included automatically.
- **default export** — the React component that gets server-rendered and then hydrated on the client.

See the [SSR and Data Loading docs](../../docs/ssr-and-data-loading.md) for a full reference.

---

## Layouts

Create `layout.tsx` files to wrap pages with shared structure. Layouts nest automatically based on directory depth.

```tsx
// src/routes/layout.tsx

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>My App</title>
      </head>
      <body>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
```

Every page in the app is rendered inside this layout. For section-specific layouts (e.g., a dashboard sidebar), add a `layout.tsx` in the relevant subdirectory.

See the [Layouts docs](../../docs/layouts.md) for nesting, route groups, and more.

---

## Static Pages (SSG)

Export `prerender = true` to render the page to a static HTML file at build time:

```tsx
// src/routes/about/page.tsx

export const prerender = true;

export default function About() {
  return <div><h1>About Us</h1></div>;
}
```

For dynamic routes, export a `prerender` object with a `paths()` function:

```tsx
export const prerender = {
  paths() {
    return [
      { slug: 'hello-world' },
      { slug: 'getting-started' },
    ];
  },
};
```

---

## The `<Image>` Component

The adapter exports an `<Image>` component that generates responsive `<picture>` elements. It works with the `pyraImages()` plugin from `pyrajs-core` to serve optimized WebP/AVIF variants.

```tsx
import { Image } from 'pyrajs-adapter-react';

export default function Hero() {
  return (
    <Image
      src="/images/hero.jpg"
      alt="Mountain landscape"
      width={1280}
      height={720}
      sizes="100vw"
    />
  );
}
```

In development, images are optimized on-demand. In production, pre-built variants are served with immutable cache headers.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string` | required | Image path relative to `public/` |
| `alt` | `string` | required | Alt text for accessibility |
| `width` | `number` | — | Intrinsic display width (prevents layout shift) |
| `height` | `number` | — | Intrinsic display height (prevents layout shift) |
| `sizes` | `string` | `'100vw'` | CSS `sizes` descriptor for the browser's width selection |
| `formats` | `ImageFormat[]` | `['avif', 'webp']` | Formats to request, best-first |
| `widths` | `number[]` | `[640, 1280, 1920]` | Width variants to generate |
| `quality` | `number` | `80` | Compression quality 1–100 |
| `loading` | `'lazy' \| 'eager'` | `'lazy'` | Browser loading behavior |
| `className` | `string` | — | Class applied to the `<img>` element |
| `style` | `CSSProperties` | — | Inline styles applied to the `<img>` element |

Enable the plugin in your config to activate image optimization:

```ts
// pyra.config.ts
import { pyraImages } from 'pyrajs-core';

export default defineConfig({
  adapter: createReactAdapter(),
  plugins: [pyraImages({ formats: ['webp', 'avif'] })],
});
```

See the [Image Optimization docs](../../docs/image-optimization.mdx) for full details.

---

## How SSR Works

When a request comes in, Pyra calls into the adapter through the `PyraAdapter` interface:

1. **`renderToHTML(component, data, context)`** — the adapter receives the imported page component, the data returned by `load()`, and a `RenderContext` with layouts. It calls `renderToString()` and returns the HTML string.
2. **`getHydrationScript(clientPath, data, layoutClientPaths)`** — generates the inline `<script type="module">` that calls `hydrateRoot()` on the client.
3. **`getDocumentShell(appContainerId)`** — returns the base HTML document with `<!--pyra-head-->` and `<!--pyra-outlet-->` markers that Pyra replaces with the rendered content and asset tags.

The adapter wraps the page in any layouts before calling `renderToString()`, building the element tree from innermost (page) to outermost (root layout) using `createElement`.

Core never imports React — the adapter boundary in `PyraAdapter` keeps the UI framework completely isolated.

---

## TypeScript

The package ships full TypeScript declarations. JSX is handled by esbuild with `jsx: 'automatic'` and `jsxImportSource: 'react'` — no separate Babel or TSC step is needed.

Add `"jsx": "react-jsx"` to your project's `tsconfig.json` for editor support:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx"
  }
}
```

## License

MIT
