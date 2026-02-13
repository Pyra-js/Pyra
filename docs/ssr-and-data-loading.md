# SSR and Data Loading

How Pyra renders pages on the server and loads data for them.

---

## What is SSR?

SSR stands for **Server-Side Rendering**. It means the server builds the full HTML for a page before sending it to the browser.

Without SSR (a traditional single-page app), the browser receives a mostly empty HTML file and waits for JavaScript to download and run before anything appears on screen. With SSR, the browser gets a complete page immediately — text, images, layout, everything — and then JavaScript kicks in to make it interactive.

This gives you two benefits:

- **Faster initial load** — users see content right away instead of staring at a blank screen
- **Better SEO** — search engines can read the fully rendered HTML without running JavaScript

In Pyra, every page is server-rendered by default. You don't need to opt in or configure anything.

---

## How a Page Gets Rendered

When a user visits a URL in your Pyra app, here's what happens step by step:

1. **Route matching** — Pyra's router looks at the URL and finds the matching page in your `src/routes/` directory
2. **Middleware** — any `middleware.ts` files in the path run first (from root to innermost)
3. **Data loading** — if the page exports a `load()` function, it runs on the server to fetch data
4. **Rendering** — the page component is rendered to HTML, wrapped in any layouts along the way
5. **Asset injection** — Pyra injects CSS links, JS bundles, and hydration scripts into the HTML
6. **Response** — the complete HTML is sent to the browser

The browser receives a fully rendered page. Then the JavaScript bundle loads and "hydrates" the page — attaching event handlers and making buttons, forms, and interactive elements work.

---

## The `load()` Function

The most important part of data loading in Pyra is the `load()` function. If a page needs data from a database, an API, or anywhere else, it exports a `load()` function that runs on the server before the page renders.

```tsx
// src/routes/blog/[slug]/page.tsx

export async function load(context) {
  const post = await db.posts.findBySlug(context.params.slug);
  return { post };
}

export default function BlogPost({ post }) {
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </article>
  );
}
```

Here's what happens:

1. A user visits `/blog/hello-world`
2. Pyra matches the route and sees there's a `load()` function
3. `load()` runs on the server — `context.params.slug` is `"hello-world"`
4. `load()` returns `{ post: { title: "Hello World", body: "..." } }`
5. That data is spread into the component's props — the component receives `post` as a prop
6. Pyra renders the component to HTML and sends it to the browser

### What `load()` Receives

The `load()` function gets a `RequestContext` object with everything about the current request:

| Field | What it is |
|-------|------------|
| `context.request` | The Web standard [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) object |
| `context.url` | Parsed URL with `pathname`, `searchParams`, etc. |
| `context.params` | Route parameters like `{ slug: 'hello-world' }` |
| `context.headers` | Request headers |
| `context.cookies` | Cookie jar — `get()`, `set()`, `delete()`, `getAll()` |
| `context.env` | Environment variables (only those prefixed with `PYRA_`) |
| `context.mode` | `'development'` or `'production'` |
| `context.routeId` | The matched route ID (e.g., `/blog/[slug]`) |

It also has response helpers: `context.json()`, `context.html()`, `context.redirect()`, `context.text()`.

### What `load()` Returns

Whatever object you return from `load()` gets spread into your component's props. The route `params` are also passed as a `params` prop automatically.

```tsx
export async function load(context) {
  return { title: 'Hello', count: 42 };
}

// Component receives: { title: 'Hello', count: 42, params: { ... } }
export default function MyPage({ title, count, params }) {
  return <h1>{title} ({count})</h1>;
}
```

### `load()` is Server-Only

The `load()` function never runs in the browser. It only runs on the server (or at build time for prerendered pages). This means you can safely:

- Query a database directly
- Use API keys and secrets
- Read from the filesystem
- Call internal services

None of this code ends up in the client JavaScript bundle.

### Returning a Response from `load()`

If you need to redirect the user or return an error, you can return a `Response` object instead of data:

```tsx
export async function load(context) {
  const user = await getUser(context.cookies.get('session'));

  if (!user) {
    return context.redirect('/login');
  }

  return { user };
}
```

---

## Reading Query Parameters

Use `context.url.searchParams` to read query string values:

```tsx
// URL: /search?q=pyra&page=2

export async function load(context) {
  const query = context.url.searchParams.get('q');
  const page = parseInt(context.url.searchParams.get('page') || '1');
  const results = await search(query, page);
  return { results, query, page };
}
```

---

## Static Prerendering (SSG)

Some pages don't change between requests — an "About" page, a blog post, documentation. For these, you can opt into **static prerendering**. Pyra renders the page to HTML once at build time and serves the static file directly, skipping server rendering entirely.

Export `prerender = true` from your page:

```tsx
// src/routes/about/page.tsx

export const prerender = true;

export default function About() {
  return (
    <div>
      <h1>About Us</h1>
      <p>We build great things.</p>
    </div>
  );
}
```

When you run `pyra build`, this page is rendered to a static HTML file. At runtime, the server serves it directly without re-rendering.

### Prerendering Dynamic Routes

For dynamic routes like `/blog/[slug]`, you need to tell Pyra which parameter values to prerender. Export a `prerender` object with a `paths()` function:

```tsx
// src/routes/blog/[slug]/page.tsx

export const prerender = {
  paths() {
    return [
      { slug: 'hello-world' },
      { slug: 'getting-started' },
      { slug: 'advanced-guide' },
    ];
  },
};

export async function load(context) {
  const post = await fetchPost(context.params.slug);
  return { post };
}

export default function BlogPost({ post }) {
  return <article><h1>{post.title}</h1></article>;
}
```

At build time, Pyra calls `paths()` to get the list, then renders each one: `/blog/hello-world`, `/blog/getting-started`, `/blog/advanced-guide`. Each becomes a static HTML file.

---

## Cache Control

You can control how browsers and CDNs cache your pages by exporting a `cache` object:

```tsx
export const cache = {
  maxAge: 3600,              // Browser caches for 1 hour
  sMaxAge: 86400,            // CDN caches for 1 day
  staleWhileRevalidate: 604800, // Serve stale while revalidating for 7 days
};

export default function PricingPage() {
  return <div>...</div>;
}
```

Pyra translates this into the appropriate `Cache-Control` HTTP header on the response.

| Field | What it does |
|-------|-------------|
| `maxAge` | How long (seconds) the browser can use its cached copy |
| `sMaxAge` | How long (seconds) a CDN can use its cached copy |
| `staleWhileRevalidate` | How long (seconds) a stale cache entry can be served while a fresh one is fetched in the background |

---

## Page Metadata

Export a `metadata` object to set the page title, description, and other head tags:

```tsx
export const metadata = {
  title: 'My Blog Post',
  description: 'A deep dive into building web apps with Pyra',
};

export default function BlogPost() {
  return <article>...</article>;
}
```

Pyra injects this into the `<head>` section of the HTML during rendering.

---

## How Hydration Works

After the server sends the rendered HTML, the browser needs to make it interactive. This process is called **hydration**.

Here's what happens behind the scenes:

1. The browser loads the page — it's already fully rendered HTML, so the user sees content immediately
2. Pyra includes a `<script type="module">` tag that imports the page component and any layout components
3. The script also reads any `load()` data that Pyra embedded in a `<script id="__pyra_data">` tag (so it doesn't need to re-fetch)
4. The script calls `hydrateRoot()` (for React) which attaches event handlers to the existing HTML without re-rendering it

The result: the page appears instantly as static HTML, then becomes fully interactive once JavaScript loads. The user doesn't see a flash or re-render — hydration preserves the existing DOM.

---

## The Adapter

Pyra doesn't do the rendering itself — it delegates to an **adapter**. The adapter is the bridge between Pyra's core and your UI framework. The React adapter uses `renderToString()` on the server and `hydrateRoot()` on the client. But because the adapter is pluggable, other frameworks (Svelte, Vue, Solid) can be supported without changing Pyra's core. See the [Adapters doc](./adapters.md) for details.

---

## Putting It All Together

Here's a complete example of a page with data loading, caching, and metadata:

```tsx
// src/routes/products/[id]/page.tsx

export const metadata = {
  title: 'Product Details',
};

export const cache = {
  maxAge: 300,       // Browser caches for 5 minutes
  sMaxAge: 3600,     // CDN caches for 1 hour
};

export async function load(context) {
  const product = await db.products.findById(context.params.id);

  if (!product) {
    return context.redirect('/products');
  }

  return { product };
}

export default function ProductPage({ product }) {
  return (
    <div>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      <span>${product.price}</span>
      <button onClick={() => addToCart(product.id)}>Add to Cart</button>
    </div>
  );
}
```

What Pyra does with this:

1. Matches the URL `/products/abc123` to this route
2. Runs any middleware in the chain
3. Calls `load()` with `context.params.id = "abc123"` — fetches the product from the database
4. Renders the component to HTML with the product data, wrapped in layouts
5. Sets `Cache-Control` headers based on the `cache` export
6. Injects metadata into `<head>`
7. Embeds the product data in a `<script>` tag for hydration
8. Sends the complete HTML to the browser
9. The browser hydrates the page — the "Add to Cart" button becomes clickable

---

## Tips

- **Use `load()` for anything that needs server data.** Database queries, API calls, file reads — all belong in `load()`.
- **Don't fetch data inside components.** Fetching in `load()` means the data is ready before rendering starts, so the page renders in one pass with no loading spinners.
- **Use prerendering for static content.** If a page rarely changes, `export const prerender = true` makes it faster and cheaper to serve.
- **Keep `load()` fast.** The time spent in `load()` directly adds to the response time. Use caching, efficient queries, and parallel fetches where possible.
- **Check the request tracer.** Pyra's built-in tracing shows you exactly how long `load()` takes for every request. See the [Request Tracing doc](./request-tracing.md).
