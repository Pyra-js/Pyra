# Pyra.js Examples

Runnable example applications demonstrating Pyra.js features. Each app is self-contained with its own `package.json` and can be started independently.

## Example Apps

### [`pyra-blog`](./pyra-blog/)

The comprehensive reference app. Combines SSR, SSG, API routes, middleware, layouts, error boundaries, and a custom 404 page in a single project.

**Concepts covered:** `load()`, `prerender`, API routes, middleware auth, nested layouts, error boundaries, `404.tsx`

```bash
pnpm --filter pyra-blog dev
```

---

### [`routing-showcase`](./routing-showcase/)

Every routing pattern Pyra supports, each with a live URL you can visit.

**Concepts covered:** static routes, dynamic `[id]`, catch-all `[...path]`, route groups `(name)`, `load()` with `ctx.params`

```bash
pnpm --filter routing-showcase dev
```

---

### [`api-crud`](./api-crud/)

A pure API example — no meaningful UI, all logic in route handlers. Demonstrates HTTP method dispatch, 405 responses, and in-memory state.

**Concepts covered:** `GET`/`POST`/`PUT`/`DELETE` exports, 405 Method Not Allowed, catch-all API routes, `ctx.request.json()`

```bash
pnpm --filter api-crud dev
```

Then exercise the API:

```bash
curl http://localhost:3000/api/items
curl -X POST http://localhost:3000/api/items \
     -H 'Content-Type: application/json' \
     -d '{"name":"Widget","value":42}'
curl http://localhost:3000/api/echo/foo/bar/baz
```

---

### [`middleware-auth`](./middleware-auth/)

Cookie-based auth with stacked middleware. Root middleware stamps every response with request-id and timing headers; dashboard middleware guards the protected route.

**Concepts covered:** middleware stacking, short-circuiting, `ctx.cookies`, `Set-Cookie` response headers

```bash
pnpm --filter middleware-auth dev
```

1. Visit `http://localhost:3000` — you are not logged in.
2. Click **Log in → this demo link** to set the session cookie.
3. Navigate to `/dashboard` — the middleware lets you through.
4. Click **Log out** to clear the cookie, then try `/dashboard` again.

---

### [`ssg-cache`](./ssg-cache/)

Static site generation and cache-control headers in one place.

**Concepts covered:** `prerender = true`, `prerender = { paths() }`, `cache = { maxAge, sMaxAge, staleWhileRevalidate }`

```bash
# Dev — SSG pages rendered on-demand, Cache-Control header still set
pnpm --filter ssg-cache dev

# Prod — generates actual static HTML files in dist/client/
pnpm --filter ssg-cache build
pnpm --filter ssg-cache start
```

After building, inspect `dist/client/about/index.html` and `dist/client/releases/` for the pre-rendered output.

---

### [`image-optimization`](./image-optimization/)

On-demand and pre-built image optimization using the `pyraImages()` plugin and the `<Image>` component.

**Concepts covered:** `pyraImages()` plugin, `<Image>` component, `/_pyra/image` endpoint, `formats`, `sizes`, `quality`

```bash
pnpm --filter image-optimization dev
```

> Requires `sharp` to be installed: `npm install sharp` inside the example directory.

---

## Running all examples

From the repo root:

```bash
# Install all workspace dependencies
pnpm install

# Start a specific example
pnpm --filter pyra-blog dev
pnpm --filter routing-showcase dev
pnpm --filter api-crud dev
pnpm --filter middleware-auth dev
pnpm --filter ssg-cache dev
pnpm --filter image-optimization dev
```

---

## Configuration reference

See [`pyra.config.reference.ts`](./pyra.config.reference.ts) for a fully documented reference of every `PyraConfig` field.

For mode-aware configuration (`defineConfigFn`), see the comment at the bottom of that file.
