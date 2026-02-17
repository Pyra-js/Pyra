# routing-showcase

Tests Pyra's trie-based router and filesystem scanner.

## What it covers

| Pattern | File | URL |
|---|---|---|
| Static | `routes/page.tsx` | `/` |
| Static | `routes/about/page.tsx` | `/about` |
| Dynamic `[id]` | `routes/products/[id]/page.tsx` | `/products/:id` |
| Catch-all `[...path]` | `routes/docs/[...path]/page.tsx` | `/docs/*` |
| Route group `(auth)` | `routes/(auth)/login/page.tsx` | `/login` |
| Route group `(auth)` | `routes/(auth)/register/page.tsx` | `/register` |

## Key concepts

- **Priority order**: static > dynamic > catch-all at each trie node.
- **Route groups** strip the `(name)` folder from the URL — useful for co-locating related routes.
- **`load()`** runs server-side and receives `ctx.params` with the extracted segment values.

## Run

```bash
pnpm dev   # from repo root: pnpm --filter routing-showcase dev
```
