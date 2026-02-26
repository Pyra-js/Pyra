# Environment Variables

Manage secrets and environment-specific configuration with `.env` files.

---

## How it works

Pyra reads `.env` files from your project root at startup — before the dev server starts, before a build runs, and before the production server starts. The variables are merged into `process.env` and then filtered into `ctx.env` inside every `load()` function, middleware, and API handler.

Only variables whose names start with a configured prefix (default: `PYRA_`) are exposed. Everything else in `process.env` stays invisible to your route code. This prevents accidentally leaking secrets like `DATABASE_URL` or `AWS_SECRET_ACCESS_KEY` into responses.

---

## File loading order

Pyra looks for these files in your project root and loads them in priority order (lowest → highest):

| File | Purpose |
|------|---------|
| `.env` | Base values shared across all environments |
| `.env.local` | Local overrides — add to `.gitignore`, never commit |
| `.env.development` | Loaded only when mode is `development` |
| `.env.development.local` | Local development overrides — add to `.gitignore` |
| `.env.production` | Loaded only when mode is `production` |
| `.env.production.local` | Local production overrides — add to `.gitignore` |

Files listed later override files listed earlier. A key in `.env.development` overrides the same key in `.env`.

**Shell variables always win.** If `PYRA_API_URL` is already set in your shell or CI environment, no `.env` file can overwrite it. This lets you override values per-machine or per-deploy without touching any files.

---

## Your first `.env` file

Create a `.env` file in your project root:

```bash
# .env
PYRA_API_URL=https://api.example.com
PYRA_FEATURE_NEW_UI=false
```

Then read the values inside a `load()` function:

```ts
// src/routes/dashboard/page.tsx
import type { RequestContext } from 'pyrajs-shared';

export async function load(ctx: RequestContext) {
  const apiUrl = ctx.env.API_URL;         // "https://api.example.com"
  const newUI = ctx.env.FEATURE_NEW_UI;   // "false"

  const data = await fetch(`${apiUrl}/data`).then(r => r.json());
  return { data, newUI: newUI === 'true' };
}
```

Note that the `PYRA_` prefix is stripped from the key — `PYRA_API_URL` becomes `ctx.env.API_URL`.

---

## Using env vars in middleware and API routes

`ctx.env` is available everywhere a `RequestContext` is passed:

```ts
// src/routes/middleware.ts — authentication using an env var
import type { Middleware } from 'pyrajs-shared';

const auth: Middleware = async (ctx, next) => {
  const token = ctx.headers.get('Authorization')?.replace('Bearer ', '');

  if (token !== ctx.env.API_SECRET) {
    return ctx.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return next();
};

export default auth;
```

```ts
// src/routes/api/data/route.ts
import type { RequestContext } from 'pyrajs-shared';

export async function GET(ctx: RequestContext) {
  const upstream = await fetch(ctx.env.UPSTREAM_URL);
  const json = await upstream.json();
  return ctx.json(json);
}
```

---

## Different values per environment

Use the mode-specific files to provide different values in development and production:

```bash
# .env
PYRA_APP_NAME=My App

# .env.development
PYRA_API_URL=http://localhost:4000
PYRA_LOG_LEVEL=debug

# .env.production
PYRA_API_URL=https://api.example.com
PYRA_LOG_LEVEL=error
```

When you run `pyra dev` (mode = `development`), `ctx.env.API_URL` is `http://localhost:4000`.
When you run `pyra build` and `pyra start` (mode = `production`), `ctx.env.API_URL` is `https://api.example.com`.

---

## Local overrides

`.env.local` is loaded in every mode and is meant for values that differ per developer machine — database credentials, API keys for personal test accounts, local service ports. It should always be gitignored so it never gets committed:

```bash
# .gitignore
.env.local
.env.*.local
```

```bash
# .env.local (your machine only — not committed)
PYRA_DATABASE_URL=postgres://localhost/myapp_dev
PYRA_STRIPE_KEY=sk_test_your_personal_key
```

---

## Configuration options

All `.env` behavior is controlled by the `env` block in `pyra.config.ts`:

```ts
import { defineConfig } from 'pyrajs-shared';

export default defineConfig({
  env: {
    // Directory containing .env files. Defaults to the project root.
    dir: 'config/env',

    // Only env vars with this prefix are exposed via ctx.env.
    // The prefix is stripped from the key. Default: 'PYRA_'
    prefix: 'APP_',

    // Additional .env files to load, in order, after the standard files.
    // These have the highest priority (except shell variables).
    // Paths are relative to the project root.
    files: ['.env.shared', '.env.secrets'],
  },
});
```

### `env.prefix`

The prefix acts as a namespace. Only variables that start with it are exposed to your route code — everything else in `process.env` is invisible to `ctx.env`.

```bash
# With prefix: 'APP_'
APP_API_URL=https://api.example.com   # → ctx.env.API_URL ✓
DATABASE_URL=postgres://localhost/db   # → not exposed       ✗
```

`prefix` also accepts an array when you need to expose variables from multiple namespaces:

```ts
export default defineConfig({
  env: {
    prefix: ['PYRA_', 'VITE_'],
  },
});
```

Both `PYRA_API_URL` and `VITE_API_URL` would be exposed — each with its own prefix stripped:

```ts
ctx.env.API_URL  // from whichever namespace matched first
```

### `env.dir`

By default Pyra looks for `.env` files in the project root. Set `dir` to point somewhere else — useful if you keep configuration files in a subdirectory:

```ts
export default defineConfig({
  env: { dir: 'config' },
});
```

Now Pyra reads `config/.env`, `config/.env.local`, etc.

### `env.files`

Explicitly list additional files to load after the standard discovery set. Useful for shared secrets files checked into a separate internal repo, or generated files produced by a secrets manager:

```ts
export default defineConfig({
  env: { files: ['.env.vault', 'secrets/.env.generated'] },
});
```

These files are always loaded last, so they override everything except shell variables.

---

## `.env` file syntax

```bash
# Full-line comments are ignored
KEY=value

# Quoted values — use when the value contains spaces or special characters
GREETING="Hello, world!"
PATH_WITH_SPACES='/my path/with spaces'

# Optional export prefix — for shell script compatibility
export PYRA_SOME_KEY=some_value

# Inline comments — everything after " #" is stripped
PYRA_TIMEOUT=30   # seconds
```

Rules:
- One variable per line
- Keys and values are trimmed of surrounding whitespace
- Double-quoted and single-quoted values preserve interior whitespace
- `export KEY=value` is treated identically to `KEY=value`
- Blank lines are ignored
- Variable interpolation (`$OTHER_VAR`) is **not** supported — values are taken literally

---

## Prerendering and `ctx.env`

Environment variables are also available inside `load()` functions that run during `pyra build` for statically prerendered routes (`export const prerender = true`). Pyra loads `.env` files before the build starts, so your `load()` functions see the same `ctx.env` values they would at runtime.

```ts
// src/routes/about/page.tsx
export const prerender = true;

export async function load(ctx) {
  // ctx.env.API_URL is set from .env.production during pyra build
  const content = await fetch(`${ctx.env.API_URL}/content/about`).then(r => r.json());
  return { content };
}
```

---

## Security

**Never commit secrets.** Variables in `.env` are loaded into `process.env` on the server. They are never sent to the browser — Pyra has no mechanism for client-side env injection, and the prefix filtering ensures only intentionally exposed variables appear in `ctx.env`.

Recommended `.gitignore` entries:

```bash
.env.local
.env.*.local
.env.secrets
```

Commit `.env` only if it contains non-sensitive defaults (placeholder values, feature flags). Put all real secrets in `.env.local` or in your deployment platform's environment variable settings.

**In CI and production**, set variables directly in the platform's environment rather than using `.env` files. Shell variables always override file variables, so your deployment environment has full control.

---

## Troubleshooting

**`ctx.env.MY_KEY` is `undefined`.**
Check that:
1. The variable name in your `.env` file starts with your configured prefix (default: `PYRA_`)
2. The `.env` file is in the project root (or the directory set by `env.dir`)
3. You restarted the dev server after adding the file — Pyra loads `.env` files at startup, not on every request

**A variable I set in `.env.local` isn't overriding `.env`.**
`.env.local` is loaded after `.env` and should win. Check that the key is spelled identically in both files and that the file is actually being found (it must be in the same directory as `.env`).

**A variable I set in my shell isn't being picked up.**
Shell variables are read directly from `process.env` — they don't need to be in any `.env` file and are always available as long as the name matches the prefix. Verify the prefix with `console.log(ctx.env)` inside a `load()` function.

**Variables work in dev but not in the production build.**
Make sure the variables are set in your deployment environment or in a `.env.production` file. `pyra build` loads `.env.production` (and `.env`) at build time for prerendered routes. The production server (`pyra start`) loads them again at startup for SSR routes.
