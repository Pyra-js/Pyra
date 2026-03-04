# @pyra-js/adapter-react

React adapter for Pyra.js. Wires React 18/19 into the Pyra SSR pipeline, server-side rendering with `renderToString()`, client-side hydration with `hydrateRoot()`, layout wrapping, and an `<Image>` component for responsive image optimization.

```bash
npm install @pyra-js/adapter-react react react-dom
# or
pnpm add @pyra-js/adapter-react react react-dom
```

**Peer dependencies:** `react ^18.0.0 || ^19.0.0` and `react-dom ^18.0.0 || ^19.0.0`

---

## Setup

Pass the adapter to your Pyra config:

```ts
// pyra.config.ts
import { defineConfig } from '@pyra-js/cli';
import { createReactAdapter } from '@pyra-js/adapter-react';

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

- **`load(context)`** - runs on the server before rendering. Whatever it returns is spread into the component's props. Route `params` are always included automatically.
- **default export** - the React component that gets server-rendered and then hydrated on the client.

See the [SSR and Data Loading docs](https://pyrajs.dev/docs/ssr) for a full reference.

---

## Layouts

Create `layout.tsx` files to wrap pages with shared structure. Layouts nest automatically based on directory depth.

```tsx
// src/routes/layout.tsx
import { Link } from '@pyra-js/adapter-react';

export default function RootLayout({ children }) {
  return (
    <div>
      <nav>
        <Link href="/">Home</Link>
        <Link href="/about">About</Link>
      </nav>
      <main>{children}</main>
    </div>
  );
}
```

Every page in the app is rendered inside this layout. For section-specific layouts (e.g., a dashboard sidebar), add a `layout.tsx` in the relevant subdirectory.

See the [Layouts docs](https://pyrajs.dev/docs/layout) for nesting, route groups, and more.

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

## How SSR Works

When a request comes in, Pyra calls into the adapter through the `PyraAdapter` interface:

1. **`renderToHTML(component, data, context)`** - the adapter receives the imported page component, the data returned by `load()`, and a `RenderContext` with layouts. It calls `renderToString()` and returns the HTML string.
2. **`getHydrationScript(clientPath, data, layoutClientPaths)`** - generates the inline `<script type="module">` that calls `hydrateRoot()` on the client.
3. **`getDocumentShell(appContainerId)`** - returns the base HTML document with `<!--pyra-head-->` and `<!--pyra-outlet-->` markers that Pyra replaces with the rendered content and asset tags.

The adapter wraps the page in any layouts before calling `renderToString()`, building the element tree from innermost (page) to outermost (root layout) using `createElement`.

Core never imports React - the adapter boundary in `PyraAdapter` keeps the UI framework completely isolated.

---

## TypeScript

The package ships full TypeScript declarations. JSX is handled by esbuild with `jsx: 'automatic'` and `jsxImportSource: 'react'` - no separate Babel or TSC step is needed.

Add `"jsx": "react-jsx"` to your project's `tsconfig.json` for editor support:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx"
  }
}
```

## Full Documentation

[pyrajs/adapter-react](https://pyrajs.dev/docs/adapter-react)

---

## License

MIT
