# Cookies

Read and write cookies through `ctx.cookies` in any load function, API handler, or middleware.

---

## How Cookies Work in Pyra

Browsers send cookies on every request as a single `Cookie` header — a semicolon-separated string like `session=abc123; theme=dark`. Responses set new cookies or remove existing ones via `Set-Cookie` headers on the way back.

Pyra handles both sides for you through `ctx.cookies`, a `CookieJar` that is built from the incoming `Cookie` header at the start of each request. You read from it and write to it using methods — you never touch headers directly. Any cookie mutations you make are automatically applied to the response after your handler returns.

---

## Reading Cookies

### `ctx.cookies.get(name)`

Returns the cookie value as a string, or `undefined` if it doesn't exist.

```ts
export function GET(ctx) {
  const session = ctx.cookies.get('session');

  if (!session) {
    return ctx.json({ error: 'Not logged in' }, { status: 401 });
  }

  return ctx.json({ session });
}
```

Values are URL-decoded automatically — you don't need to call `decodeURIComponent` yourself.

### `ctx.cookies.getAll()`

Returns all cookies as a plain object.

```ts
export function GET(ctx) {
  const all = ctx.cookies.getAll();
  // { session: "abc123", theme: "dark", locale: "en" }
  return ctx.json(all);
}
```

---

## Setting Cookies

### `ctx.cookies.set(name, value, options?)`

Queues a `Set-Cookie` header to be sent with the response. The cookie is also immediately readable via `ctx.cookies.get()` within the same request — you don't have to wait for the next request to read what you just set.

```ts
export function POST(ctx) {
  const token = generateSessionToken();

  ctx.cookies.set('session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,  // 1 week in seconds
    path: '/',
  });

  return ctx.redirect('/dashboard');
}
```

Values are URL-encoded automatically — you don't need to call `encodeURIComponent` yourself.

### Cookie options

| Option | Type | Description |
|--------|------|-------------|
| `maxAge` | `number` | How long the cookie lives, in seconds. `0` deletes it. |
| `expires` | `Date` | Absolute expiry date. Prefer `maxAge` — it's more reliable across time zones. |
| `path` | `string` | URL path the cookie is scoped to. Use `'/'` for site-wide cookies. |
| `domain` | `string` | Domain the cookie is scoped to. Omit for the current host. |
| `secure` | `boolean` | Only sent over HTTPS. Always use this in production for sensitive cookies. |
| `httpOnly` | `boolean` | Not accessible from JavaScript (`document.cookie`). Use this for session tokens. |
| `sameSite` | `"strict" \| "lax" \| "none"` | Controls cross-site sending. See below. |

### `sameSite` values

| Value | Behaviour |
|-------|-----------|
| `"lax"` | Sent on same-site requests and top-level navigations (clicking a link). The right default for most cookies. |
| `"strict"` | Only sent on same-site requests. More restrictive — users arriving from external links won't have the cookie on the first request. |
| `"none"` | Sent on all requests, including cross-site. Requires `secure: true`. Use for third-party embeds or cross-origin APIs. |

---

## Deleting Cookies

### `ctx.cookies.delete(name)`

Removes a cookie by setting its value to empty and its `Max-Age` to `0`, which tells the browser to discard it immediately.

```ts
export function POST(ctx) {
  ctx.cookies.delete('session');
  return ctx.redirect('/login');
}
```

The browser only removes a cookie if the `path` and `domain` match exactly what was used when the cookie was set. If you set a cookie with `path: '/'`, delete it with the same path:

```ts
ctx.cookies.set('session', token, { path: '/', httpOnly: true });

// later...
ctx.cookies.delete('session');  // fine — delete uses Max-Age: 0 but no path
```

If the cookie was set on a specific path and `delete()` doesn't seem to work, set it manually with `maxAge: 0` and the matching path:

```ts
ctx.cookies.set('session', '', { maxAge: 0, path: '/dashboard' });
```

---

## How Mutations Are Applied

You never write `Set-Cookie` headers yourself. Pyra reads any pending mutations from `ctx.cookies` after your handler returns and appends them to the response.

This means the order of operations in your handler doesn't matter — Pyra collects all mutations and applies them at the end:

```ts
export async function POST(ctx) {
  ctx.cookies.set('a', '1');
  ctx.cookies.set('b', '2');
  ctx.cookies.delete('old');

  // All three Set-Cookie headers will be on the response
  return ctx.json({ ok: true });
}
```

This also works through middleware — if middleware sets a cookie and then calls `next()`, the cookie is still applied to the final response.

---

## Examples

### Session-based authentication

Set a session cookie on login, read it in middleware, delete it on logout:

```ts
// src/routes/api/login/route.ts
export async function POST(ctx) {
  const { username, password } = await ctx.request.json();
  const user = await db.verifyCredentials(username, password);

  if (!user) {
    return ctx.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = await createSession(user.id);

  ctx.cookies.set('session', token, {
    httpOnly: true,
    secure: ctx.mode === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return ctx.json({ ok: true });
}
```

```ts
// src/routes/dashboard/middleware.ts
import type { Middleware } from 'pyrajs-shared';

const auth: Middleware = async (ctx, next) => {
  const token = ctx.cookies.get('session');

  if (!token || !(await validateSession(token))) {
    return ctx.redirect('/login');
  }

  return next();
};

export default auth;
```

```ts
// src/routes/api/logout/route.ts
export function POST(ctx) {
  ctx.cookies.delete('session');
  return ctx.redirect('/login');
}
```

### User preferences

Store non-sensitive preferences like theme or locale without a database:

```ts
// src/routes/api/preferences/route.ts
export async function POST(ctx) {
  const { theme } = await ctx.request.json();

  ctx.cookies.set('theme', theme, {
    maxAge: 60 * 60 * 24 * 365,  // 1 year
    path: '/',
    sameSite: 'lax',
  });

  return ctx.json({ ok: true });
}
```

```ts
// src/routes/page.tsx
export function load(ctx) {
  const theme = ctx.cookies.get('theme') ?? 'light';
  return { theme };
}
```

### Flash messages

Pass a one-time message through a redirect — set it before the redirect, read and delete it on arrival:

```ts
// src/routes/api/submit/route.ts
export async function POST(ctx) {
  await processForm(await ctx.request.json());

  ctx.cookies.set('flash', 'Saved successfully', {
    maxAge: 30,
    path: '/',
    sameSite: 'lax',
  });

  return ctx.redirect('/dashboard');
}
```

```ts
// src/routes/dashboard/page.tsx
export function load(ctx) {
  const flash = ctx.cookies.get('flash');

  if (flash) {
    ctx.cookies.delete('flash');
  }

  return { flash };
}
```

---

## Tips

- **Always set `path: '/'` for session cookies.** Without it, the browser scopes the cookie to the current URL path, which means `/api/login` sets a cookie only visible to requests under `/api/`. Use `path: '/'` for any cookie that should be site-wide.
- **Use `httpOnly: true` for session tokens.** This prevents JavaScript from reading the cookie, protecting against XSS attacks that try to steal session data.
- **Use `secure: true` in production.** The `ctx.mode` field lets you set this conditionally: `secure: ctx.mode === 'production'`.
- **Prefer `maxAge` over `expires`.** `maxAge` is relative (in seconds from now), so it works correctly regardless of clock differences between the server and browser. `expires` is an absolute date — if the clocks are out of sync, behaviour is unpredictable.
- **Cookie values are always strings.** You can't store objects or numbers directly. Serialize them: `ctx.cookies.set('prefs', JSON.stringify(prefs))`, then `JSON.parse(ctx.cookies.get('prefs') ?? '{}')`.
- **Cookies are not encrypted.** Anyone with access to the browser can read a cookie's value. Never store raw passwords, tokens with embedded permissions, or sensitive user data directly in a cookie value. Store an opaque session ID and look up the sensitive data server-side.
