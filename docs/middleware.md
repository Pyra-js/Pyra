# Middleware

Intercept and control requests before they reach your routes.

---

## What is Middleware?

Think of middleware as checkpoints a request passes through before it reaches your page or API handler. Each checkpoint can inspect the request, let it through, or stop it entirely.

Common uses for middleware:

- **Authentication** — check if the user is logged in before showing a page
- **Logging** — record every request for debugging
- **Redirects** — send users to a different URL
- **Rate limiting** — block users making too many requests
- **CORS** — add headers that allow cross-origin requests

Without middleware, you'd have to copy the same checks into every route handler. Middleware lets you write it once and apply it to a whole section of your app.

---

## Creating Middleware

Create a `middleware.ts` (or `middleware.js`) file in any directory under `src/routes/`. That middleware automatically applies to every route in that directory and all its subdirectories.

A middleware file must default-export a function with this shape:

```ts
import type { Middleware } from '@pyra-js/shared';

const myMiddleware: Middleware = async (context, next) => {
  // Do something before the route handler runs

  const response = await next(); // Pass the request along

  // Do something after the route handler runs

  return response;
};

export default myMiddleware;
```

Two parameters:
- `context` — information about the current request (URL, headers, cookies, params, etc.)
- `next` — a function you call to pass the request to the next middleware or the route handler

Two choices:
- **Call `next()`** — the request continues down the chain
- **Return a Response without calling `next()`** — the request stops here (this is called short-circuiting)

---

## How Middleware Stacks

Middleware is collected from the root directory down to the matched route's directory. The outermost middleware runs first.

For example, given this structure:

```
src/routes/
├── middleware.ts              # 1. Runs first (root)
├── dashboard/
│   ├── middleware.ts          # 2. Runs second
│   └── settings/
│       └── page.tsx           # 3. Route handler runs last
```

A request to `/dashboard/settings` passes through:

1. `src/routes/middleware.ts` (root middleware)
2. `src/routes/dashboard/middleware.ts` (dashboard middleware)
3. The settings page handler

Each middleware calls `next()` to pass the request to the next one in line. If any middleware returns a response without calling `next()`, the chain stops — no subsequent middleware or route handler runs.

---

## The Context Object

Every middleware receives a `context` object with everything you need to inspect and respond to the request:

| Field | Description |
|-------|-------------|
| `context.request` | The Web standard [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) object |
| `context.url` | Parsed URL with `pathname`, `searchParams`, etc. |
| `context.params` | Route parameters (e.g., `{ slug: 'hello' }`) |
| `context.headers` | Request headers |
| `context.cookies` | Cookie jar with `get()`, `set()`, `delete()`, `getAll()` |
| `context.env` | Environment variables (filtered by `PYRA_` prefix) |
| `context.mode` | `'development'` or `'production'` |
| `context.routeId` | The matched route's ID (e.g., `/blog/[slug]`) |

Response helpers for quickly building responses:

| Helper | Description |
|--------|-------------|
| `context.json(data, init?)` | Return a JSON response |
| `context.html(body, init?)` | Return an HTML response |
| `context.redirect(url, status?)` | Return a redirect (default 302) |
| `context.text(body, init?)` | Return a plain text response |

---

## Examples

### Logging

Record every request with its method, path, and response time:

```ts
// src/routes/middleware.ts
import type { Middleware } from '@pyra-js/shared';

const logger: Middleware = async (context, next) => {
  const start = Date.now();
  console.log(`--> ${context.request.method} ${context.url.pathname}`);

  const response = await next();

  console.log(`<-- ${response.status} (${Date.now() - start}ms)`);
  return response;
};

export default logger;
```

### Authentication

Block unauthorized users from accessing dashboard routes:

```ts
// src/routes/dashboard/middleware.ts
import type { Middleware } from '@pyra-js/shared';

const auth: Middleware = async (context, next) => {
  const token = context.cookies.get('session');

  if (!token) {
    // No session cookie — redirect to login
    return context.redirect('/login');
  }

  // Session exists, let the request through
  return next();
};

export default auth;
```

Because this file is in `src/routes/dashboard/`, it only applies to `/dashboard` and its sub-routes. The login page at `/login` is unaffected.

### Adding Response Headers

Modify the response after it comes back from the route handler:

```ts
// src/routes/api/middleware.ts
import type { Middleware } from '@pyra-js/shared';

const cors: Middleware = async (context, next) => {
  const response = await next();

  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  return response;
};

export default cors;
```

### Redirecting Old URLs

Send users from an old path to a new one:

```ts
// src/routes/middleware.ts
import type { Middleware } from '@pyra-js/shared';

const redirects: Middleware = async (context, next) => {
  if (context.url.pathname === '/old-blog') {
    return context.redirect('/blog', 301);
  }
  return next();
};

export default redirects;
```

---

## Short-Circuiting

When a middleware returns a response without calling `next()`, the entire chain stops immediately. The response is sent directly to the client, and no downstream middleware or route handler ever runs.

This is the mechanism behind auth guards, rate limiters, and any middleware that conditionally blocks requests:

```ts
const rateLimiter: Middleware = async (context, next) => {
  const ip = context.headers.get('x-forwarded-for') || 'unknown';
  const allowed = checkRateLimit(ip);

  if (!allowed) {
    return context.json(
      { error: 'Too many requests' },
      { status: 429 }
    );
    // next() is never called — the route handler never runs
  }

  return next();
};
```

---

## Where to Put Middleware

The directory where you place `middleware.ts` determines its scope:

| Location | Applies to |
|----------|------------|
| `src/routes/middleware.ts` | Every request in your app |
| `src/routes/api/middleware.ts` | All API routes under `/api` |
| `src/routes/dashboard/middleware.ts` | All dashboard pages and sub-routes |
| `src/routes/dashboard/settings/middleware.ts` | Only `/dashboard/settings` and deeper |

Middleware in a parent directory always runs before middleware in a child directory. You can't change the order — it's determined by the directory structure.

---

## Middleware Applies to Both Pages and APIs

Unlike layouts (which only wrap pages), middleware runs for both page routes (`page.tsx`) and API routes (`route.ts`). If you put a middleware in `src/routes/middleware.ts`, it intercepts every request — pages, API calls, everything in that directory tree.

---

## Async and Sync

Middleware can be either async or sync. Pyra normalizes both automatically:

```ts
// Async middleware (most common)
const asyncMw: Middleware = async (context, next) => {
  await someAsyncCheck();
  return next();
};

// Sync middleware (also fine)
const syncMw: Middleware = (context, next) => {
  if (context.url.pathname === '/blocked') {
    return context.text('Blocked', { status: 403 });
  }
  return next();
};
```

---

## Tips

- **Keep each middleware focused on one thing.** A logging middleware should just log. An auth middleware should just check auth. Don't combine unrelated concerns.
- **Put auth middleware where it's needed.** If only `/dashboard` needs authentication, put the middleware in `src/routes/dashboard/middleware.ts` — not in the root where it would slow down every request.
- **You can modify the response.** Since `next()` returns the downstream Response, you can add headers, change the status, or transform the body before returning it.
- **Order is automatic.** You don't configure middleware order — the directory structure determines it. Root runs first, then each child directory in order.
- **Middleware runs on every request to its scope.** If your middleware does expensive work (like a database call), make sure it's scoped narrowly enough that it only runs where needed.
