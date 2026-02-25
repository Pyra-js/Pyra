# CORS

Allow browsers to make cross-origin requests to your Pyra server.

---

## What is CORS?

Browsers enforce a rule called the **Same-Origin Policy**: JavaScript on a page can only make requests to the same origin (protocol + domain + port) that served the page. If your frontend and backend live on different origins, the browser blocks the request before it goes out.

This shows up as an error in the browser console:

```
Access to fetch at 'http://localhost:3000/api/items' from origin
'http://localhost:3002' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

The server can opt in to allow cross-origin requests by sending **CORS headers** — specifically `Access-Control-Allow-Origin` — in its responses. When the browser sees this header, it allows the JavaScript to read the response.

Pyra handles all of this automatically. You configure which origins are allowed and Pyra adds the right headers to every response.

---

## Default Behavior

Pyra's behavior differs between development and production because the needs are different.

**Development** — CORS is **enabled by default** with `Access-Control-Allow-Origin: *`. This means any origin can reach your dev server. This is the right default for development: you might run your frontend on `:3002` and your API on `:3000`, and you don't want CORS to get in the way while you're building.

**Production** — CORS is **disabled by default**. Headers are only added when you explicitly configure them. This is the safe default: most production apps serve the frontend and backend from the same origin (no CORS needed), and opening up cross-origin access is a deliberate decision.

---

## Enabling CORS

Configure CORS in your `pyra.config.ts` under `server.cors`:

```ts
import { defineConfig } from 'pyrajs-shared';

export default defineConfig({
  server: {
    cors: true, // Allow all origins (Access-Control-Allow-Origin: *)
  },
});
```

In production, `true` is a quick way to open your API to any origin. For most APIs this is fine, but if your users authenticate with cookies or session tokens, use a specific origin instead (see [Credentials](#credentials) below).

---

## Configuration Options

For more control, pass a `CorsConfig` object instead of `true`:

```ts
export default defineConfig({
  server: {
    cors: {
      origin: 'https://app.example.com',
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
      maxAge: 3600,
    },
  },
});
```

### `CorsConfig` reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `origin` | `boolean \| string \| string[]` | `true` | Which origins are allowed. See [Origin matching](#origin-matching). |
| `methods` | `string[]` | All methods | HTTP methods to allow (e.g. `['GET', 'POST']`). |
| `allowedHeaders` | `string[]` | `['Content-Type', 'Authorization']` | Request headers the browser is allowed to send. |
| `exposedHeaders` | `string[]` | — | Response headers the browser is allowed to read. |
| `credentials` | `boolean` | `false` | Allow cookies and auth headers across origins. Requires a specific `origin` — cannot be used with `*`. |
| `maxAge` | `number` | `86400` | How long (in seconds) the browser caches the preflight response. |

---

## Origin Matching

The `origin` option controls which origins receive the `Access-Control-Allow-Origin` header.

### Allow all origins

```ts
cors: true
// or
cors: { origin: true }
```

Sends `Access-Control-Allow-Origin: *` on every response. Any page on the web can call your API.

### Single origin

```ts
cors: { origin: 'https://app.example.com' }
```

Only requests from `https://app.example.com` receive the CORS header. Requests from other origins get no header and are blocked by the browser.

### Multiple origins

```ts
cors: {
  origin: ['https://app.example.com', 'https://staging.example.com'],
}
```

Pyra checks the request's `Origin` header against the list. If it matches, the exact origin is echoed back in `Access-Control-Allow-Origin` (and a `Vary: Origin` header is added so caches store separate responses per origin). If it doesn't match, no header is sent.

### Disable

```ts
cors: false
// or omit server.cors entirely in production
```

No CORS headers are sent. The browser blocks all cross-origin requests to your server.

---

## Credentials

Cookies, `Authorization` headers, and TLS client certificates are considered "credentials." By default, browsers strip them from cross-origin requests. To allow them, set `credentials: true`:

```ts
cors: {
  origin: 'https://app.example.com', // must be a specific origin, not true/'*'
  credentials: true,
}
```

This sends `Access-Control-Allow-Credentials: true` in the response, which tells the browser to include credentials and expose the response to JavaScript.

> **Important:** `credentials: true` cannot be combined with `origin: true` (wildcard). Browsers reject this combination. Always pair credentials with a specific origin or origin list.

On the client side, you also need to set `credentials: 'include'` in your fetch call:

```ts
const res = await fetch('https://api.example.com/me', {
  credentials: 'include', // send cookies with the request
});
```

---

## Preflight Requests

When a browser makes a cross-origin request with a non-simple method (`PUT`, `DELETE`, `PATCH`) or a custom header (`Authorization`, `X-Custom-Header`), it first sends an `OPTIONS` request to check whether the server allows it. This is called a **preflight**.

Pyra handles preflight requests automatically. When an `OPTIONS` request arrives, Pyra responds with `204 No Content` and the appropriate `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, and `Access-Control-Max-Age` headers — without the request ever reaching your route handlers.

You don't need to add an `OPTIONS` handler to your API routes.

---

## Examples

### Development — no config needed

In development, CORS is on by default. A frontend on `:3002` can reach an API on `:3000` with no configuration:

```ts
// pyra.config.ts — no server.cors needed in development
import { defineConfig } from 'pyrajs-shared';

export default defineConfig({
  // ...
});
```

### Public API (any origin)

An API intended to be callable from any website:

```ts
export default defineConfig({
  server: {
    cors: true,
  },
});
```

### Single-page app on a different domain

A React or vanilla SPA served from a CDN at `app.example.com` calling an API at `api.example.com`:

```ts
export default defineConfig({
  server: {
    cors: {
      origin: 'https://app.example.com',
    },
  },
});
```

### Multiple environments

Allow both production and staging frontends:

```ts
export default defineConfig({
  server: {
    cors: {
      origin: [
        'https://app.example.com',
        'https://staging.example.com',
      ],
    },
  },
});
```

### Authenticated requests with cookies

A frontend that sends session cookies to an API on a different origin:

```ts
// pyra.config.ts
export default defineConfig({
  server: {
    cors: {
      origin: 'https://app.example.com',
      credentials: true,
    },
  },
});
```

```ts
// Client-side fetch
const res = await fetch('https://api.example.com/dashboard', {
  credentials: 'include',
});
```

### Mode-aware config

Different CORS settings for development and production using `defineConfigFn`:

```ts
import { defineConfigFn } from 'pyrajs-shared';

export default defineConfigFn((mode) => ({
  server: {
    cors:
      mode === 'development'
        ? true // allow all in dev
        : { origin: 'https://app.example.com', credentials: true },
  },
}));
```

---

## Per-Route CORS with Middleware

The `server.cors` config applies CORS headers to **every** response from your server — pages, API routes, static files, all of it. For most apps this is exactly what you want.

If you need different CORS rules on different parts of your API, use [middleware](./middleware.md) instead. Place a `middleware.ts` in the relevant routes directory and set the headers on the response directly:

```ts
// src/routes/api/public/middleware.ts
// Only routes under /api/public get these permissive headers
import type { Middleware } from 'pyrajs-shared';

const publicCors: Middleware = async (context, next) => {
  const response = await next();
  response.headers.set('Access-Control-Allow-Origin', '*');
  return response;
};

export default publicCors;
```

```ts
// src/routes/api/private/middleware.ts
// Routes under /api/private only allow your own frontend
import type { Middleware } from 'pyrajs-shared';

const privateCors: Middleware = async (context, next) => {
  const response = await next();
  response.headers.set('Access-Control-Allow-Origin', 'https://app.example.com');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
};

export default privateCors;
```

Note that route middleware doesn't automatically handle `OPTIONS` preflight requests — those are short-circuited before your middleware runs. If your API uses methods like `PUT` or `DELETE`, enable `server.cors` at the config level for preflight support, or add an `OPTIONS` handler to your `route.ts` manually.

---

## Troubleshooting

**The header is still missing after setting `cors: true`.**
Check that you're restarting the dev server after changing `pyra.config.ts`. Config changes require a restart.

**It works in development but not production.**
Production CORS is opt-in. Make sure you've set `server.cors` in your production config. If you use `defineConfigFn`, verify the production branch is correct.

**I'm getting a CORS error even though the origin is in my list.**
The `Origin` header sent by the browser must match exactly — including the protocol and port. `https://app.example.com` and `http://app.example.com` are different origins. Check the Network tab in DevTools to see the exact value the browser is sending.

**`credentials: true` isn't working.**
Two things are required on both sides:
1. Server: `cors: { origin: 'https://your-origin.com', credentials: true }` — a specific origin, not `*`.
2. Client: `fetch(url, { credentials: 'include' })`.

If either side is missing, cookies won't be sent and the browser will block the response.

**OPTIONS requests are returning 404.**
If you're using a reverse proxy (nginx, Cloudflare, etc.) in front of Pyra, make sure `OPTIONS` requests are being forwarded to Pyra rather than handled or dropped by the proxy.

---

## Tips

- **Don't enable CORS in production if you don't need it.** If your frontend and API are on the same origin, the browser never sends a cross-origin request and CORS is irrelevant. Enabling it unnecessarily widens your attack surface.
- **Prefer specific origins over `*` in production.** Wildcard allows any website to call your API. For public read APIs this is fine; for anything touching user data, lock it down.
- **Use `maxAge` to reduce preflight overhead.** By default, preflight responses are cached for 24 hours. If your CORS config rarely changes, this is a good default. Set it lower only if you need to change CORS rules and have users with long-lived browser sessions.
- **Test with DevTools open.** When a CORS error occurs, the Network tab shows you the exact request and response headers. The response headers (or absence of them) tell you immediately whether Pyra is sending the right headers.
