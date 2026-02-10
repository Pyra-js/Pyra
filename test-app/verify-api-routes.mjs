/**
 * v0.6 API Routes Verification Script
 *
 * Tests that API routes work end-to-end in both dev and production servers,
 * including catch-all routes, 405 handling, and RequestContext.
 *
 * Run from repo root: node test-app/verify-api-routes.mjs
 */
import { DevServer, ProdServer, build } from "../packages/core/dist/index.js";
import { createReactAdapter } from "../packages/adapter-react/dist/index.js";
import { resolve } from "node:path";
import http from "node:http";

const root = resolve(import.meta.dirname);
const routesDir = resolve(root, "src/routes");
const DEV_PORT = 3458;
const PROD_PORT = 3459;

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

/**
 * Make an HTTP request with any method.
 */
function request(port, method, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path: urlPath,
        method,
        headers: options.headers || {},
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, body, headers: res.headers }),
        );
      },
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function get(port, urlPath, options) {
  return request(port, "GET", urlPath, options);
}

function post(port, urlPath, options) {
  return request(port, "POST", urlPath, options);
}

// ── Test suite ────────────────────────────────────────────────────────────────

async function testApiRoutes(port, label) {
  console.log(`\n── ${label} (port ${port}) ──`);

  // ── Health endpoint ──────────────────────────────────────────────────
  console.log("\nHealth API route (/api/health):");
  {
    const res = await get(port, "/api/health");
    assert(res.status === 200, `GET /api/health → 200 (got ${res.status})`);
    const data = JSON.parse(res.body);
    assert(data.status === "ok", `Response body has status: "ok"`);
    assert(
      res.headers["content-type"]?.includes("application/json"),
      "Content-Type is application/json",
    );
  }

  // ── Health 405 ───────────────────────────────────────────────────────
  console.log("\n405 Method Not Allowed:");
  {
    const res = await post(port, "/api/health");
    assert(res.status === 405, `POST /api/health → 405 (got ${res.status})`);
    const data = JSON.parse(res.body);
    assert(data.error.includes("not allowed"), `Error message says "not allowed"`);
    assert(
      res.headers["allow"]?.includes("GET"),
      `Allow header includes GET (got: ${res.headers["allow"]})`,
    );
  }

  // ── Users list ───────────────────────────────────────────────────────
  console.log("\nUsers API route (/api/users):");
  {
    const res = await get(port, "/api/users");
    assert(res.status === 200, `GET /api/users → 200 (got ${res.status})`);
    const data = JSON.parse(res.body);
    assert(Array.isArray(data.users), "Response contains users array");
    assert(data.users.length === 2, `Users array has 2 items (got ${data.users.length})`);
  }

  // ── Users POST ───────────────────────────────────────────────────────
  {
    const res = await post(port, "/api/users");
    assert(res.status === 201, `POST /api/users → 201 (got ${res.status})`);
    const data = JSON.parse(res.body);
    assert(data.created === true, "POST response has created: true");
    assert(data.method === "POST", 'POST response has method: "POST"');
  }

  // ── Users 405 on PUT ─────────────────────────────────────────────────
  {
    const res = await request(port, "PUT", "/api/users");
    assert(res.status === 405, `PUT /api/users → 405 (got ${res.status})`);
    const allow = res.headers["allow"] || "";
    assert(allow.includes("GET") && allow.includes("POST"), `Allow header lists GET, POST (got: ${allow})`);
  }

  // ── Dynamic param: /api/users/:id ────────────────────────────────────
  console.log("\nDynamic API route (/api/users/[id]):");
  {
    const res = await get(port, "/api/users/42");
    assert(res.status === 200, `GET /api/users/42 → 200 (got ${res.status})`);
    const data = JSON.parse(res.body);
    assert(data.userId === "42", `params.id is "42" (got "${data.userId}")`);
    assert(
      data.routeId === "/api/users/[id]",
      `routeId is "/api/users/[id]" (got "${data.routeId}")`,
    );
  }

  // ── Dynamic DELETE ───────────────────────────────────────────────────
  {
    const res = await request(port, "DELETE", "/api/users/7");
    assert(res.status === 200, `DELETE /api/users/7 → 200 (got ${res.status})`);
    const data = JSON.parse(res.body);
    assert(data.deleted === true, "DELETE response has deleted: true");
    assert(data.userId === "7", `DELETE params.id is "7" (got "${data.userId}")`);
  }

  // ── Catch-all: /api/auth/[...path] ──────────────────────────────────
  console.log("\nCatch-all API route (/api/auth/[...path]):");
  {
    const res = await get(port, "/api/auth/callback/github");
    assert(res.status === 200, `GET /api/auth/callback/github → 200 (got ${res.status})`);
    const data = JSON.parse(res.body);
    assert(
      data.path === "callback/github",
      `params.path is "callback/github" (got "${data.path}")`,
    );
  }

  // ── Catch-all single segment ─────────────────────────────────────────
  {
    const res = await get(port, "/api/auth/login");
    assert(res.status === 200, `GET /api/auth/login → 200 (got ${res.status})`);
    const data = JSON.parse(res.body);
    assert(
      data.path === "login",
      `params.path is "login" (got "${data.path}")`,
    );
  }

  // ── Catch-all deep nesting ───────────────────────────────────────────
  {
    const res = await get(port, "/api/auth/oauth/google/callback");
    assert(res.status === 200, `GET /api/auth/oauth/google/callback → 200 (got ${res.status})`);
    const data = JSON.parse(res.body);
    assert(
      data.path === "oauth/google/callback",
      `params.path is "oauth/google/callback" (got "${data.path}")`,
    );
  }

  // ── Catch-all POST ───────────────────────────────────────────────────
  {
    const res = await post(port, "/api/auth/token/refresh");
    assert(res.status === 200, `POST /api/auth/token/refresh → 200 (got ${res.status})`);
    const data = JSON.parse(res.body);
    assert(data.path === "token/refresh", `POST catch-all params.path correct`);
    assert(data.method === "POST", `POST catch-all returns method: "POST"`);
  }

  // ── 404 for non-existent API routes ──────────────────────────────────
  console.log("\n404 for non-existent routes:");
  {
    const res = await get(port, "/api/nonexistent");
    assert(res.status === 404, `GET /api/nonexistent → 404 (got ${res.status})`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("=== v0.6 API Routes Verification ===\n");

// ── Phase 1: Dev server tests ────────────────────────────────────────────────

console.log("Starting dev server...");
const adapter = createReactAdapter();
const dev = new DevServer({
  port: DEV_PORT,
  root,
  adapter,
  routesDir,
  config: { appContainerId: "app" },
});

try {
  const result = await dev.start();
  console.log(`Dev server running on port ${result.port}`);
  console.log(`  SSR: ${result.ssr}, Routes: ${result.pageRouteCount} pages, ${result.apiRouteCount} APIs`);

  await testApiRoutes(DEV_PORT, "Dev Server");

  await dev.stop();
  console.log("\nDev server stopped.");
} catch (err) {
  console.error("Dev server error:", err);
  try { await dev.stop(); } catch {}
}

// ── Phase 2: Production build + prod server tests ────────────────────────────

console.log("\n\n── Building for production ──");
try {
  await build({
    root,
    adapter,
    config: { outDir: "dist", appContainerId: "app", routesDir: "src/routes" },
    silent: true,
  });
  console.log("Build complete.");

  console.log("\nStarting production server...");
  const distDir = resolve(root, "dist");
  const prod = new ProdServer({
    distDir,
    adapter,
    port: PROD_PORT,
    config: { appContainerId: "app" },
  });

  await prod.start();

  await testApiRoutes(PROD_PORT, "Production Server");

  await prod.stop();
  console.log("\nProduction server stopped.");
} catch (err) {
  console.error("Production test error:", err);
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log("\n=== Results ===");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);

if (failed > 0) {
  console.log("\nSOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("\nALL TESTS PASSED");
}
