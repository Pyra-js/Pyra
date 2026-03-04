# Routing

How Pyra maps URLs to files — no configuration required.

---

## How It Works

Pyra uses **file-based routing**. The directory structure of your `src/routes/` folder directly determines the URLs your app responds to. There's no router config, no route registration, and no imports to maintain. Add a file, get a route.

```
src/routes/
├── page.tsx          →  /
├── about/
│   └── page.tsx      →  /about
├── blog/
│   ├── page.tsx      →  /blog
│   └── [slug]/
│       └── page.tsx  →  /blog/:slug
└── api/
    └── posts/
        └── route.ts  →  /api/posts
```

Every time you start the dev server or run a build, Pyra scans `src/routes/`, builds a route tree from the files it finds, and compiles a trie-based router for fast URL matching at runtime.

---

## Route Files

Pyra recognises five special file names inside `src/routes/`:

| File | Purpose |
|------|---------|
| `page.tsx` | A page — renders HTML at this URL |
| `route.ts` | An API route — handles HTTP requests at this URL |
| `layout.tsx` | Wraps all pages in this directory and below |
| `middleware.ts` | Runs before all routes in this directory and below |
| `error.tsx` | Error boundary for this directory and below |

Everything else in the directory (components, utilities, styles) is ignored by the router.

---

## Static Routes

Static routes map a fixed URL to a file. Add a directory for each URL segment:

```
src/routes/
├── page.tsx                →  /
├── about/
│   └── page.tsx            →  /about
├── pricing/
│   └── page.tsx            →  /pricing
└── blog/
    └── page.tsx            →  /blog
```

---

## Dynamic Routes

Use square brackets around a directory name to create a dynamic segment — a part of the URL that can be any value:

```
src/routes/
└── blog/
    └── [slug]/
        └── page.tsx   →  /blog/:slug
```

The bracketed name becomes a key in `context.params`. A request to `/blog/hello-world` gives you `context.params.slug === "hello-world"`.

You can have multiple dynamic segments in the same route:

```
src/routes/
└── shop/
    └── [category]/
        └── [productId]/
            └── page.tsx   →  /shop/:category/:productId
```

Both `context.params.category` and `context.params.productId` are available.

### Params are always strings

Route parameters come in as strings, even if the value looks like a number. Parse them if needed:

```ts
const id = parseInt(context.params.id);
```

---

## Catch-All Routes

Use `[...name]` to match any number of URL segments after a prefix:

```
src/routes/
└── docs/
    └── [...path]/
        └── page.tsx
```

This matches `/docs`, `/docs/getting-started`, `/docs/api/reference/types` — any depth. `context.params.path` is the full remaining path as a string (e.g., `"api/reference/types"`).

---

## Route Priority

When multiple routes could match a URL, Pyra uses this priority order:

1. **Static** — exact directory name match (e.g., `about/`)
2. **Dynamic** — bracketed segment (e.g., `[slug]/`)
3. **Catch-all** — spread segment (e.g., `[...path]/`)

So if you have both `src/routes/blog/featured/page.tsx` and `src/routes/blog/[slug]/page.tsx`, a request to `/blog/featured` will always match the static route.

---

## Route Groups

Wrap a directory name in parentheses to group routes without affecting the URL. The group name is stripped entirely:

```
src/routes/
├── (marketing)/
│   ├── about/
│   │   └── page.tsx    →  /about
│   └── pricing/
│       └── page.tsx    →  /pricing
└── (app)/
    └── dashboard/
        └── page.tsx    →  /dashboard
```

Route groups are useful for applying a shared layout or middleware to a set of routes without adding a URL prefix. See the [Layouts doc](./layouts.md) and [Middleware doc](./middleware.md) for details.

---

## Pages and API Routes at the Same Path

A `page.tsx` and a `route.ts` can coexist in the same directory. They serve different purposes at the same URL:

```
src/routes/
└── users/
    ├── page.tsx   →  GET /users  (returns HTML)
    └── route.ts   →  GET /users  (returns JSON)
```

Pyra routes browser navigation requests to the page and API calls to the route handler. They don't conflict.

---

## How URLs Are Matched

Pyra builds a **trie** (prefix tree) from your route files at startup. Each request walks the trie segment by segment until it finds a match or exhausts all options. This makes route matching fast regardless of how many routes your app has.

The match result includes:
- The matched route file
- Extracted params (for dynamic/catch-all segments)
- The layout chain from root down to the matched route
- Any middleware paths that apply

---

## Navigation

For navigating between pages, use Pyra's `<Link>` component instead of plain `<a>` tags. It intercepts same-origin clicks and performs client-side navigation without a full page reload:

```tsx
import { Link } from "@pyra-js/adapter-react";

export default function Nav() {
  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/blog">Blog</Link>
      <Link href="/about">About</Link>
    </nav>
  );
}
```

For programmatic navigation (e.g., after a form submit), use `window.__pyra.navigate(href)`.

External links and modifier-key clicks (Cmd+click, Ctrl+click) fall through to normal browser behavior automatically.

---

## The `src/routes/` Directory

By default, Pyra looks for routes in `src/routes/`. You can change this in your config:

```ts
// pyra.config.ts
import { defineConfig } from "@pyra-js/cli";

export default defineConfig({
  routesDir: "src/pages", // custom routes directory
});
```

---

## Tips

- **No index files.** Pyra uses `page.tsx`, not `index.tsx`. The distinction is intentional — `index` is ambiguous, `page` is explicit.
- **Colocate related files.** You can put component files, hooks, and utilities right alongside your routes. Pyra only picks up `page.tsx`, `route.ts`, `layout.tsx`, `middleware.ts`, and `error.tsx` — everything else is ignored.
- **Don't install a separate router.** If you're using Pyra for routing, you don't need `react-router-dom` or any other client-side router. They'd conflict. Pyra's `<Link>` component and file-based routing cover everything.
- **Dynamic params are always strings.** Parse with `parseInt()` or `parseFloat()` when you need numbers.
