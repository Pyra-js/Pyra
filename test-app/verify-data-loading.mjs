/**
 * v0.3 Data Loading + RequestContext Verification Script
 *
 * Tests that load() exports work, RequestContext is correctly built,
 * and data flows through SSR and hydration.
 *
 * Run from repo root: node test-app/verify-data-loading.mjs
 */
import { DevServer } from "../packages/core/dist/index.js";
import { createReactAdapter } from "../packages/adapter-react/dist/index.js";
import { resolve } from "node:path";
import http from "node:http";

const root = resolve(import.meta.dirname);
const routesDir = resolve(root, "src/routes");
const PORT = 3457;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  \u2713 ${message}`);
    passed++;
  } else {
    console.log(`  \u2717 ${message}`);
    failed++;
  }
}

/** Strip React SSR comment markers (<!-- -->) for cleaner assertions */
function stripComments(html) {
  return html.replace(/<!-- -->/g, "");
}

/** Make an HTTP GET request, optionally not following redirects */
function get(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: "localhost",
      port: PORT,
      path: urlPath,
      method: "GET",
      headers: options.headers || {},
    };

    http
      .get(`http://localhost:${PORT}${urlPath}`, { headers: options.headers || {} }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, body, headers: res.headers }),
        );
      })
      .on("error", reject);
  });
}

// ── Start server ──────────────────────────────────────────────────────────────

console.log("\n=== v0.3 Data Loading + RequestContext Verification ===\n");
console.log(`Starting dev server on port ${PORT}...`);

const adapter = createReactAdapter();
const server = new DevServer({ port: PORT, root, adapter, routesDir });
await server.start();

console.log("Server started. Running tests...\n");

try {
  // ── Test 1: Home page (no load) still works ─────────────────────────────

  console.log("--- Test: Home page (/) — no load() ---");
  const home = await get("/");
  assert(home.status === 200, `GET / returns 200 (got ${home.status})`);
  assert(
    home.body.includes("<h1>Welcome to Pyra</h1>"),
    "SSR rendered home page without load()",
  );
  assert(
    home.body.includes("__pyra_data"),
    "Contains hydration data script",
  );

  // ── Test 2: Blog with load() ────────────────────────────────────────────

  console.log("\n--- Test: Blog with load() (/blog/hello-world) ---");
  const blog = await get("/blog/hello-world");
  assert(blog.status === 200, `GET /blog/hello-world returns 200 (got ${blog.status})`);
  assert(
    blog.body.includes("<h1>Post: hello-world</h1>"),
    "SSR rendered title from load() data",
  );
  assert(
    blog.body.includes("hello-world</strong>"),
    "SSR rendered slug from load() data",
  );
  assert(
    blog.body.includes("Loaded at:"),
    "SSR rendered loadedAt timestamp from load()",
  );

  // Verify __pyra_data contains the load data
  const blogDataMatch = blog.body.match(
    /<script id="__pyra_data"[^>]*>(.*?)<\/script>/,
  );
  if (blogDataMatch) {
    // The data is escaped for script safety, so unescape it
    const raw = blogDataMatch[1]
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\u0026/g, "&");
    const data = JSON.parse(raw);
    assert(
      data.title === "Post: hello-world",
      `Hydration data has title='Post: hello-world' (got ${data.title})`,
    );
    assert(
      data.slug === "hello-world",
      `Hydration data has slug='hello-world' (got ${data.slug})`,
    );
    assert(
      typeof data.loadedAt === "string",
      `Hydration data has loadedAt timestamp (got ${typeof data.loadedAt})`,
    );
    assert(
      data.params?.slug === "hello-world",
      `Hydration data has params.slug='hello-world' (got ${JSON.stringify(data.params)})`,
    );
  } else {
    assert(false, "Could not find __pyra_data script tag");
  }

  // ── Test 3: Different slug ──────────────────────────────────────────────

  console.log("\n--- Test: Blog with different slug (/blog/pyra-rocks) ---");
  const blog2 = await get("/blog/pyra-rocks");
  assert(blog2.status === 200, `GET /blog/pyra-rocks returns 200`);
  assert(
    blog2.body.includes("<h1>Post: pyra-rocks</h1>"),
    "load() receives correct slug param for different URL",
  );

  // ── Test 4: Dashboard — RequestContext fields ───────────────────────────

  console.log("\n--- Test: Dashboard — RequestContext fields (/dashboard) ---");
  const dash = await get("/dashboard");
  const dashHtml = stripComments(dash.body);
  assert(dash.status === 200, `GET /dashboard returns 200 (got ${dash.status})`);
  assert(dashHtml.includes("Method: GET"), "RequestContext has method=GET");
  assert(
    dashHtml.includes("Path: /dashboard"),
    "RequestContext has url.pathname=/dashboard",
  );
  assert(
    dashHtml.includes("Headers: true"),
    "RequestContext headers is a Headers instance",
  );
  assert(
    dashHtml.includes("Mode: development"),
    "RequestContext mode is 'development'",
  );
  assert(
    dashHtml.includes("Route: /dashboard"),
    "RequestContext routeId is '/dashboard'",
  );
  assert(
    dashHtml.includes("Cookies: true"),
    "RequestContext has CookieJar with get()",
  );
  assert(
    dashHtml.includes("Env: true"),
    "RequestContext has env object",
  );
  assert(
    dashHtml.includes("json(): true"),
    "RequestContext has json() helper",
  );
  assert(
    dashHtml.includes("redirect(): true"),
    "RequestContext has redirect() helper",
  );

  // Verify dashboard data is in hydration payload
  const dashDataMatch = dash.body.match(
    /<script id="__pyra_data"[^>]*>(.*?)<\/script>/,
  );
  if (dashDataMatch) {
    const raw = dashDataMatch[1]
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\u0026/g, "&");
    const data = JSON.parse(raw);
    assert(
      data.method === "GET",
      "Hydration data contains method from load()",
    );
    assert(
      data.routeId === "/dashboard",
      "Hydration data contains routeId from load()",
    );
  } else {
    assert(false, "Could not find __pyra_data on dashboard page");
  }

  // ── Test 5: Redirect from load() ───────────────────────────────────────

  console.log("\n--- Test: Redirect from load() (/old-page) ---");
  const redirect = await get("/old-page");
  assert(
    redirect.status === 302,
    `GET /old-page returns 302 (got ${redirect.status})`,
  );
  assert(
    redirect.headers.location === "/about",
    `Redirect Location header is '/about' (got ${redirect.headers.location})`,
  );

  // ── Test 6: About page (no load) still works ───────────────────────────

  console.log("\n--- Test: About page (no load) (/about) ---");
  const about = await get("/about");
  assert(about.status === 200, `GET /about returns 200 (got ${about.status})`);
  assert(
    about.body.includes("<h1>About Pyra</h1>"),
    "Static page without load() still renders",
  );

  // ── Test 7: API route still returns 501 ─────────────────────────────────

  console.log("\n--- Test: API route still 501 (/api/health) ---");
  const api = await get("/api/health");
  assert(api.status === 501, `GET /api/health returns 501 (got ${api.status})`);

  // ── Test 8: 404 still works ─────────────────────────────────────────────

  console.log("\n--- Test: 404 (/nonexistent) ---");
  const notFound = await get("/nonexistent");
  assert(
    notFound.status === 404,
    `GET /nonexistent returns 404 (got ${notFound.status})`,
  );

  // ── Test 9: Client module serving still works ───────────────────────────

  console.log("\n--- Test: Client module serving ---");
  const clientModule = await get("/__pyra/modules/src/routes/page.tsx");
  assert(
    clientModule.status === 200,
    "Client module still served for hydration",
  );
  assert(
    clientModule.headers["content-type"]?.includes("application/javascript"),
    "Client module served as JavaScript",
  );
} finally {
  await server.stop();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
