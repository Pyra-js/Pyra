# Request Tracing

See exactly where time is spent on every request.

---

## What is Request Tracing?

Most web frameworks are black boxes. When a page loads slowly, you're left guessing: was it the database query? The HTML rendering? Some middleware you forgot about? You end up sprinkling `console.log` timers everywhere trying to narrow it down.

Pyra takes a different approach. Every request that hits your server gets a detailed receipt — a breakdown of exactly where time was spent. You can see which route matched, which middleware ran, how long your data loading took, how long rendering took, and how long it took to inject assets into the final HTML.

This is not a plugin or a third-party add-on. Request tracing is built into Pyra from day one. In development, it's always on. In production, you choose whether and how to enable it.

Think of it like an itemized bill at a restaurant. Instead of just seeing "dinner: $85," you see the price of each dish. Instead of just seeing "request: 120ms," you see the cost of each step in the pipeline.

---

## How It Works

Every time a request arrives at your Pyra server, a `RequestTracer` is created behind the scenes. It gets a unique ID (like `req-1`, `req-2`, and so on) and immediately starts recording.

As the request moves through each stage of the pipeline, the tracer logs the start and end of that stage:

1. **route-match** — finding which route matches the incoming URL
2. **middleware** — running middleware functions (each gets its own named stage)
3. **load** — executing the route's `load()` function (fetching data)
4. **render** — turning the component tree into HTML on the server
5. **inject-assets** — adding script tags, stylesheets, and hydration code to the HTML
6. **handler** — for API routes, executing the method handler (`GET`, `POST`, etc.)
7. **static** — for static file requests, reading from disk

When the response is sent, the tracer finalizes with the HTTP status code and the completed trace is stored in memory.

---

## What You See in Development

In development mode, every request is traced automatically. You don't need to configure anything.

Your terminal shows a compact log line for each request with a timing breakdown:

```
  GET     /blog/hello-world 200 12.3ms (route-match:0.1ms middleware:2.1ms load:5.4ms render:3.8ms inject-assets:0.9ms)
```

At a glance, you can see that the request returned a `200` in 12.3 milliseconds total, and how much time each stage contributed.

For a more detailed view, Pyra outputs a tree-style log with bottleneck highlighting:

```
  GET     /blog/hello-world 200 12.3ms
  ├─ route-match         0.1ms
  ├─ middleware           2.1ms  src/routes/middleware.ts
  ├─ load                5.4ms
  ├─ render              3.8ms
  └─ inject-assets       0.9ms
```

The highlighting rules are simple:

- A stage taking **more than 50%** of the total time is highlighted in **yellow** — it's a warning
- A stage taking **more than 80%** of the total time is highlighted in **red** — it's a bottleneck
- Status codes are color-coded: 2xx green, 3xx cyan, 4xx yellow, 5xx red

If a stage errors out, the error message is displayed inline so you can see exactly which step failed.

---

## Server-Timing Headers

Pyra adds a `Server-Timing` header to every traced response. This is a W3C standard that browsers understand natively.

What does that mean for you? Open Chrome DevTools, click a request in the Network tab, and look at the Timing section. You'll see Pyra's pipeline stages listed right there — route matching, middleware, loading, rendering — with their durations. No browser extensions, no extra setup.

The header looks like this:

```
Server-Timing: route-match;dur=0.1, middleware;dur=2.1;desc="src/routes/middleware.ts", load;dur=5.4, render;dur=3.8, inject-assets;dur=0.9
```

Each stage is listed with its duration in milliseconds and an optional description (like the middleware file path) for context.

---

## The Dev Dashboard

During development, Pyra serves a built-in dashboard at `/_pyra` in your browser. This gives you a visual overview of recent request traces and route performance.

The dashboard is backed by JSON API endpoints you can also query directly:

| Endpoint | What it returns |
|----------|----------------|
| `/_pyra/api/traces` | List of recent request traces |
| `/_pyra/api/traces/stats` | Aggregate performance stats per route (avg, p50, p95, p99) |
| `/_pyra/api/traces/:id` | Full detail for a single trace by ID (e.g., `req-42`) |

These return JSON, so you can also use them from `curl` or scripts if you prefer working outside the browser:

```bash
curl http://localhost:3000/_pyra/api/traces/stats
```

---

## Route Statistics

Pyra doesn't just show individual traces — it aggregates them to give you a picture of how each route performs over time.

For every route, Pyra tracks:

| Metric | What it means |
|--------|--------------|
| **count** | How many requests this route has handled |
| **avgMs** | The average response time |
| **p50** | The median — half of requests were faster, half slower |
| **p95** | 95% of requests were faster than this. Useful for catching occasional spikes. |
| **p99** | 99% of requests were faster than this. If this is high, some users are having a bad time. |
| **lastMs** | The response time of the most recent request |

These stats are a great way to find routes that need optimization without profiling every individual request. A route with a low average but a high p95 means it's usually fast but sometimes spikes — worth investigating.

---

## Tracing in Production

By default, tracing is **completely off** in production. No performance overhead, no trace data collected.

You can change this in your `pyra.config.ts`:

```ts
import { defineConfig } from 'pyrajs-shared';

export default defineConfig({
  trace: {
    // 'off'    — no tracing (default)
    // 'header' — only trace when X-Pyra-Trace: 1 header is present
    // 'on'     — trace every request
    production: 'header',

    // How many traces to keep in memory (ring buffer)
    bufferSize: 200,
  },
});
```

### `'off'` (default)

No tracing happens. The right choice if you don't need production tracing or rely on external monitoring tools.

### `'header'` (recommended for debugging)

Tracing only kicks in when a request includes the `X-Pyra-Trace: 1` header. This is the sweet spot: zero overhead on normal traffic, but you can selectively trace specific requests when debugging.

```bash
curl -H "X-Pyra-Trace: 1" https://myapp.com/blog/hello-world
```

The response includes the `Server-Timing` header with a full stage-by-stage breakdown. Check it in your terminal or in DevTools.

### `'on'`

Every request is traced, just like development. Useful for staging environments or internal tools where you want full visibility. Be mindful that it adds a small amount of overhead and memory usage.

### Buffer size

Traces are stored in a ring buffer in memory. When the buffer fills up, the oldest traces are dropped. The default is 200 traces.

```ts
trace: {
  bufferSize: 500, // Keep more history
}
```

Each trace is a small object, but storing thousands will use more memory. For most apps, 200 is plenty.

---

## Why This Matters

When your page is slow, Pyra tells you exactly why:

- **`load` is the bottleneck?** Your data fetching is slow — optimize database queries or API calls.
- **`render` is the bottleneck?** Your component tree is too large or doing expensive work during render.
- **`middleware` is the bottleneck?** One of your middleware functions is doing heavy processing — check the stage names to find which one.
- **`route-match` is slow?** You likely have a very large number of routes (this is rare).

No guessing. No adding timing code manually. No installing third-party APM services just to understand where your server spends its time. The information is always there in development, and available on demand in production.

---

## Tips

- **Watch the terminal during development.** The per-request log lines quickly reveal if a route is slower than expected.
- **Use the `/_pyra` dashboard** for a visual overview when you want to compare routes side by side.
- **Set `production: 'header'`** so you can debug specific production requests without tracing everything.
- **Check p95 and p99 in route stats.** A fast average with a high p95 means most users are fine, but some are hitting a slow path.
- **If `load` is consistently slow**, focus on your `load()` function — caching, query optimization, or reducing data volume will help.
- **If `render` is consistently slow**, simplify your component tree or move computation into `load()` so it happens before rendering.
- **Traces are lightweight.** In development, let them run and glance at the output as you work.
