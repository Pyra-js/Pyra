# Dev Dashboard

A built-in browser UI for monitoring builds, request traces, and HMR events while the dev server is running.

---

## Opening the Dashboard

Navigate to `/_pyra` in your browser while `pyra dev` is running:

```
http://localhost:3000/_pyra
```

No setup or configuration required. The dashboard is always available at this path during development. It is not served in production.

---

## What the Dashboard Shows

### Build stats

Four cards at the top of the page update automatically every two seconds:

| Card | What it measures |
|------|-----------------|
| **Latest Build** | How long the most recent HMR rebuild took, in milliseconds — measured from the moment you saved a file to the moment the first following request finished compiling |
| **Average Build Time** | Average of the above across all builds since the server started |
| **Total Builds** | How many file-change events have been detected since the server started |
| **Bundle Size** | Total compiled output size (in KB) from the most recent build |

### Build History

A log of every HMR rebuild since the server started, up to the last 50. Each entry shows when the build happened, how long it took, and the total output size.

---

## How Build Timing Works

Build time is not just how long it takes to invalidate the cache — that would be nearly zero and not useful. It's the full round-trip:

```
File saved
    → cache invalidated
    → browser reloads
    → request arrives
    → files compiled
    → response sent      ← build timer stops here
```

This is the real number a developer cares about: how long from hitting save to seeing the result in the browser.

---

## Data Persistence

All dashboard data lives in memory in the dev server process. Nothing is written to disk. Restarting the server clears everything.

The store uses fixed-size ring buffers — once a buffer fills, the oldest entries are dropped:

| Data | Buffer size |
|------|-------------|
| Request traces | 200 (configurable) |
| Build history | 50 |
| HMR events | 100 |

To increase the trace buffer, set `trace.bufferSize` in your config:

```ts
// pyra.config.ts
export default defineConfig({
  trace: {
    bufferSize: 500,
  },
});
```

---

## JSON API

The dashboard fetches all its data from internal JSON endpoints. You can hit these directly from Postman, curl, or your own tooling while the dev server is running.

### `GET /_pyra/api/metrics`

Returns build metrics, HMR history, and summary statistics.

```json
{
  "summary": {
    "latestBuild": { "totalDuration": 142, "bundleSize": 48200, "timestamp": 1234567890 },
    "averageBuildTime": 138,
    "totalBuilds": 12,
    "totalHMREvents": 12,
    "dependencyCount": 0
  },
  "latestBuild": { ... },
  "buildHistory": [ ... ],
  "hmrHistory": [ ... ],
  "dependencyGraph": [ ... ]
}
```

### `GET /_pyra/api/traces`

Returns the most recent 50 request traces.

```json
[
  {
    "id": "req-14",
    "method": "GET",
    "pathname": "/api/todos",
    "routeId": "/api/todos",
    "routeType": "api",
    "stages": [
      { "name": "route-match", "durationMs": 0.1, "detail": "/api/todos" },
      { "name": "compile",     "durationMs": 1.6 },
      { "name": "handler",     "durationMs": 0.6, "detail": "GET" }
    ],
    "totalMs": 2.3,
    "status": 200,
    "timestamp": 1234567890
  }
]
```

### `GET /_pyra/api/traces/stats`

Returns aggregate response time statistics per route — useful for spotting slow routes.

```json
{
  "/api/todos": {
    "routeId": "/api/todos",
    "count": 24,
    "avgMs": 3.1,
    "p50Ms": 2.8,
    "p95Ms": 6.2,
    "p99Ms": 9.1,
    "lastMs": 2.9
  }
}
```

### `GET /_pyra/api/traces/:id`

Returns a single trace by its ID (e.g. `req-14`). Returns 404 if the trace is not in the buffer.

---

## Server-Timing Headers

Every response from the dev server includes a `Server-Timing` header in the [W3C format](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server-Timing). Chrome DevTools renders this natively in the Network tab under the Timing section — no dashboard needed to see per-request pipeline breakdowns.

```
Server-Timing: route-match;dur=0.1;desc="/api/todos", compile;dur=1.6, handler;dur=0.6;desc="GET"
```

---

## Tips

- **The dashboard polls every 2 seconds.** Leave it open in a background tab while you develop and it stays current without any manual refresh.
- **Build time only appears after your first file change.** The stat cards show `--` on initial load because no HMR rebuild has happened yet. Make any edit to a source file to trigger the first build entry.
- **Use the JSON API for custom tooling.** If you want to pipe build data into a CI script, log aggregator, or custom reporter, `/_pyra/api/metrics` and `/_pyra/api/traces/stats` give you everything as plain JSON.
- **Traces are capped by the buffer.** On a busy dev server with frequent requests, old traces fall off. Increase `trace.bufferSize` in your config if you need a longer history window.
- **The dashboard is dev-only.** Navigating to `/_pyra` in a `pyra start` production server returns a 404. Request traces in production are controlled separately via `trace.production` in your config.
