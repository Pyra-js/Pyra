# Request Context

A single object containing everything about the current request — passed to every load function, API handler, and middleware.

---

## What is the Request Context?

Every time a request comes in, Pyra assembles a `RequestContext` object before any of your code runs. It combines the incoming HTTP request, the router's output, the cookie state, and filtered environment variables into one thing — then passes it to your `load()` functions, API route handlers, and middleware.

You never construct one yourself. Pyra builds it from Node's raw `IncomingMessage` and hands it to you:

```ts
// src/routes/blog/[slug]/page.tsx
import type { RequestContext } from 'pyrajs-shared';

export async function load(ctx: RequestContext) {
  const post = await db.getPost(ctx.params.slug);
  return { post };
}
```

```ts
// src/routes/api/users/route.ts
import type { RequestContext } from 'pyrajs-shared';

export function GET(ctx: RequestContext) {
  return ctx.json({ users: [] });
}
```

---

## Fields

### `ctx.request`

The Web standard [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) object. Contains the full URL, method, headers, and body.

```ts
const method = ctx.request.method;         // "GET", "POST", etc.
const body = await ctx.request.json();     // parse JSON body
const text = await ctx.request.text();     // parse text body
```

Node's native HTTP request object (`IncomingMessage`) is a different API — Pyra converts it into a proper Web `Request` automatically, including piping the body stream.

---

### `ctx.url`

A parsed [`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL) object. Avoids re-parsing the URL string in every handler.

```ts
ctx.url.pathname      // "/blog/hello-world"
ctx.url.searchParams  // URLSearchParams
ctx.url.searchParams.get('page')  // "2"
ctx.url.host          // "localhost:3000"
```

---

### `ctx.params`

Route parameters extracted by the router. Keys come from the dynamic segments in your route pattern.

```ts
// Route: /blog/[slug]
// URL:   /blog/hello-world
ctx.params.slug  // "hello-world"

// Route: /users/[id]/posts/[postId]
// URL:   /users/42/posts/7
ctx.params.id      // "42"
ctx.params.postId  // "7"

// Catch-all route: /files/[...path]
// URL:             /files/images/avatar.png
ctx.params.path  // "images/avatar.png"
```

All param values are strings. Parse them to numbers or other types as needed.

---

### `ctx.headers`

A Web standard [`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers) object. The same reference as `ctx.request.headers` — provided as a shorthand.

```ts
ctx.headers.get('authorization')    // "Bearer abc123"
ctx.headers.get('content-type')     // "application/json"
ctx.headers.has('x-custom-header')  // true / false
```

---

### `ctx.cookies`

A `CookieJar` that parses the `Cookie` header and tracks mutations. Reading and writing cookies is done through this object — not through the `headers` directly.

```ts
// Reading
ctx.cookies.get('session')    // "abc123" or undefined
ctx.cookies.getAll()          // { session: "abc123", theme: "dark" }

// Writing — changes are applied to the response automatically
ctx.cookies.set('session', 'abc123', {
  httpOnly: true,
  secure: true,
  maxAge: 60 * 60 * 24 * 7,  // 1 week in seconds
  sameSite: 'lax',
});

// Deleting — sets Max-Age: 0, which tells the browser to remove it
ctx.cookies.delete('session');
```

Cookie mutations don't require you to touch the response object. Pyra reads any pending `Set-Cookie` headers from the jar after your handler returns and applies them to the response automatically.

#### Cookie options

| Option | Type | Description |
|--------|------|-------------|
| `maxAge` | `number` | Lifetime in seconds |
| `expires` | `Date` | Absolute expiry date |
| `path` | `string` | Cookie path scope (default: `/`) |
| `domain` | `string` | Cookie domain scope |
| `secure` | `boolean` | Only sent over HTTPS |
| `httpOnly` | `boolean` | Not accessible via JavaScript |
| `sameSite` | `"strict" \| "lax" \| "none"` | Cross-site sending policy |

---

### `ctx.env`

Environment variables filtered to only those prefixed with `PYRA_`, with the prefix stripped from the keys.

```ts
// process.env.PYRA_DATABASE_URL = "postgres://..."
ctx.env.DATABASE_URL  // "postgres://..."

// process.env.PYRA_API_KEY = "secret"
ctx.env.API_KEY  // "secret"

// process.env.HOME is not exposed
ctx.env.HOME  // undefined
```

The prefix is controlled by the `env` field in your config (default: `"PYRA_"`). This keeps route handlers isolated from unrelated system environment variables.

---

### `ctx.mode`

Either `"development"` or `"production"`. Useful for conditional behavior:

```ts
export async function load(ctx: RequestContext) {
  if (ctx.mode === 'development') {
    return { data: mockData };
  }
  return { data: await fetchFromDatabase() };
}
```

---

### `ctx.routeId`

The pattern string of the matched route. Useful for logging, analytics, or middleware that needs to know which route it is running on without parsing the URL.

```ts
ctx.routeId  // "/blog/[slug]", "/api/users/[id]", etc.
```

---

## Response Helpers

Instead of constructing `Response` objects manually, the context provides four helpers that set the correct `Content-Type` header automatically.

### `ctx.json(data, init?)`

Serialize `data` to JSON and return a response with `Content-Type: application/json`.

```ts
return ctx.json({ users: [] });
return ctx.json({ error: 'Not found' }, { status: 404 });
```

### `ctx.html(body, init?)`

Return a string as HTML with `Content-Type: text/html`.

```ts
return ctx.html('<h1>Hello</h1>');
return ctx.html(renderedPage, { status: 200 });
```

### `ctx.redirect(url, status?)`

Return a redirect response. Defaults to `302 Found`. Use `301` for permanent redirects.

```ts
return ctx.redirect('/login');
return ctx.redirect('/new-url', 301);
```

### `ctx.text(body, init?)`

Return a plain string with `Content-Type: text/plain`.

```ts
return ctx.text('OK');
return ctx.text('Unauthorized', { status: 401 });
```

All four helpers accept an optional `ResponseInit` as the last argument — the same shape as the second argument to `new Response()`. Use it to set a custom status code or additional headers:

```ts
return ctx.json({ error: 'Rate limited' }, {
  status: 429,
  headers: { 'Retry-After': '60' },
});
```

---

## Where the Context is Passed

`RequestContext` is the single argument to three places in your code:

| Location | Signature |
|----------|-----------|
| Page `load()` | `load(ctx: RequestContext): unknown` |
| API route handlers | `GET(ctx: RequestContext): Response` |
| Middleware | `(ctx: RequestContext, next) => Response` |

The same object — built once per request — is passed through the entire middleware chain and into the final handler.

---

## Build-time Context

During a `pyra build`, pages with `export const prerender = true` have their `load()` function called at build time rather than at request time. Pyra creates a synthetic `RequestContext` for these calls with a stub `Request`, empty cookies, and `mode: "production"`.

This means your `load()` function must handle the absence of request-specific data gracefully when prerendering:

```ts
export async function load(ctx: RequestContext) {
  // ctx.params is populated from the prerender paths config
  const post = await db.getPost(ctx.params.slug);

  // ctx.cookies.get(...) will always be undefined at build time
  // ctx.headers will be empty at build time

  return { post };
}
```

---

## Tips

- **Parse params early.** `ctx.params` values are always strings. If a route uses a numeric ID, parse it at the top of your handler and handle the `NaN` case.
- **Use `ctx.url.searchParams` for query strings.** Don't parse `ctx.url.search` manually — `URLSearchParams` handles encoding and multi-value keys correctly.
- **Don't read `ctx.request.body` in `load()`.** The `load()` function runs on `GET` requests (page loads). Bodies come from `POST`/`PUT`/`PATCH` requests, which go to API route handlers, not `load()`.
- **Prefer the helpers over `new Response()`.** `ctx.json()` and `ctx.redirect()` are less error-prone than constructing responses by hand and ensure consistent headers.
- **Cookie mutations apply automatically.** You don't need to pass the cookie back through the response — Pyra reads pending `Set-Cookie` headers from the jar after your handler returns and applies them for you.
