/**
 * v0.8 Middleware & Layouts Verification Script
 *
 * Tests middleware stacking, layout nesting, route groups, and API middleware
 * in both dev and production servers.
 *
 * Run from repo root: node test-app/verify-middleware.mjs
 */
import { DevServer, ProdServer, build } from "../packages/core/dist/index.js";
import { createReactAdapter } from "../packages/adapter-react/dist/index.js";
import { resolve } from "node:path";
import http from "node:http";

const root = resolve(import.meta.dirname);
const routesDir = resolve(root, "src/routes");
const DEV_PORT = 3460;
const PROD_PORT = 3461;

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripComments(html) {
  return html.replace(/<!--.*?-->/g, "");
}

// ── Test suite ────────────────────────────────────────────────────────────────

async function testMiddlewareAndLayouts(port, label) {
  console.log(`\n\u2550\u2550 ${label} (port ${port}) \u2550\u2550`);

  // ── Root middleware ───────────────────────────────────────────────────
  console.log("\nRoot middleware:");
  {
    const res = await get(port, "/");
    assert(res.status === 200, `GET / \u2192 200 (got ${res.status})`);
    assert(
      res.headers["x-root-middleware"] === "true",
      `X-Root-Middleware header present`,
    );
  }

  // ── Root layout ──────────────────────────────────────────────────────
  console.log("\nRoot layout:");
  {
    const res = await get(port, "/");
    const html = stripComments(res.body);
    assert(
      html.includes('class="root-layout"'),
      `Home page wrapped in root-layout`,
    );
  }

  // ── Blog layout nesting ──────────────────────────────────────────────
  console.log("\nBlog layout nesting:");
  {
    const res = await get(port, "/blog");
    const html = stripComments(res.body);
    assert(res.status === 200, `GET /blog \u2192 200 (got ${res.status})`);
    assert(
      html.includes('class="root-layout"'),
      `Blog index has root-layout`,
    );
    assert(
      html.includes('class="blog-layout"'),
      `Blog index has blog-layout`,
    );

    // Check nesting order: root-layout should wrap blog-layout
    const rootIdx = html.indexOf('class="root-layout"');
    const blogIdx = html.indexOf('class="blog-layout"');
    assert(rootIdx < blogIdx, `root-layout wraps blog-layout (correct nesting order)`);
  }

  // ── Blog post with layout ────────────────────────────────────────────
  console.log("\nBlog post with layouts:");
  {
    const res = await get(port, "/blog/hello-world");
    const html = stripComments(res.body);
    assert(res.status === 200, `GET /blog/hello-world \u2192 200 (got ${res.status})`);
    assert(
      html.includes('class="root-layout"'),
      `Blog post has root-layout`,
    );
    assert(
      html.includes('class="blog-layout"'),
      `Blog post has blog-layout`,
    );
    assert(
      res.headers["x-root-middleware"] === "true",
      `Blog post has root middleware header`,
    );
  }

  // ── Dashboard middleware short-circuit (no auth) ──────────────────────
  console.log("\nDashboard middleware (no auth):");
  {
    const res = await get(port, "/dashboard");
    assert(res.status === 302, `GET /dashboard without auth \u2192 302 (got ${res.status})`);
    assert(
      res.headers["location"] === "/login",
      `Redirects to /login (got ${res.headers["location"]})`,
    );
  }

  // ── Dashboard middleware pass-through (with auth) ─────────────────────
  console.log("\nDashboard middleware (with auth):");
  {
    const res = await get(port, "/dashboard", {
      headers: { Cookie: "auth_token=valid123" },
    });
    assert(res.status === 200, `GET /dashboard with auth \u2192 200 (got ${res.status})`);
    assert(
      res.headers["x-root-middleware"] === "true",
      `Root middleware ran`,
    );
    assert(
      res.headers["x-dashboard-middleware"] === "true",
      `Dashboard middleware ran`,
    );
  }

  // ── Dashboard settings (both middlewares stack) ────────────────────────
  console.log("\nDashboard settings (middleware stacking):");
  {
    // Without auth → redirect
    const noAuth = await get(port, "/dashboard/settings");
    assert(
      noAuth.status === 302,
      `GET /dashboard/settings without auth \u2192 302 (got ${noAuth.status})`,
    );

    // With auth → 200 + both middleware headers
    const withAuth = await get(port, "/dashboard/settings", {
      headers: { Cookie: "auth_token=valid123" },
    });
    assert(
      withAuth.status === 200,
      `GET /dashboard/settings with auth \u2192 200 (got ${withAuth.status})`,
    );
    assert(
      withAuth.headers["x-root-middleware"] === "true",
      `Root middleware ran for settings`,
    );
    assert(
      withAuth.headers["x-dashboard-middleware"] === "true",
      `Dashboard middleware ran for settings`,
    );
  }

  // ── Route groups ─────────────────────────────────────────────────────
  console.log("\nRoute groups:");
  {
    const pricing = await get(port, "/pricing");
    assert(
      pricing.status === 200,
      `GET /pricing \u2192 200 (got ${pricing.status})`,
    );
    assert(
      stripComments(pricing.body).includes("Pricing"),
      `Pricing page content present`,
    );
    assert(
      pricing.headers["x-root-middleware"] === "true",
      `Root middleware runs for route group page`,
    );

    const features = await get(port, "/features");
    assert(
      features.status === 200,
      `GET /features \u2192 200 (got ${features.status})`,
    );
    assert(
      stripComments(features.body).includes("Features"),
      `Features page content present`,
    );
  }

  // ── Route group pages get root layout ─────────────────────────────────
  console.log("\nRoute group pages get root layout:");
  {
    const pricing = await get(port, "/pricing");
    const html = stripComments(pricing.body);
    assert(
      html.includes('class="root-layout"'),
      `Pricing page has root-layout`,
    );
  }

  // ── API middleware (protected endpoint) ───────────────────────────────
  console.log("\nAPI middleware (protected endpoint):");
  {
    // Without auth → 401
    const noAuth = await get(port, "/api/protected");
    assert(
      noAuth.status === 401,
      `GET /api/protected without auth \u2192 401 (got ${noAuth.status})`,
    );
    const noAuthBody = JSON.parse(noAuth.body);
    assert(
      noAuthBody.error === "Unauthorized",
      `Returns Unauthorized error`,
    );

    // With auth → 200
    const withAuth = await get(port, "/api/protected", {
      headers: { Authorization: "Bearer test-token" },
    });
    assert(
      withAuth.status === 200,
      `GET /api/protected with auth \u2192 200 (got ${withAuth.status})`,
    );
    const withAuthBody = JSON.parse(withAuth.body);
    assert(
      withAuthBody.message === "Protected data",
      `Returns protected data`,
    );
  }

  // ── Existing API routes still work ────────────────────────────────────
  console.log("\nExisting API routes unaffected:");
  {
    const health = await get(port, "/api/health");
    assert(
      health.status === 200,
      `GET /api/health \u2192 200 (got ${health.status})`,
    );
    assert(
      health.headers["x-root-middleware"] === "true",
      `Root middleware runs for API routes`,
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("v0.8 Middleware & Layouts Verification\n");

  const adapter = createReactAdapter();

  // ── DEV SERVER ───────────────────────────────────────────────────────────
  console.log("Starting dev server...");
  const devServer = new DevServer({
    port: DEV_PORT,
    root,
    adapter,
    routesDir,
    config: { appContainerId: "app", routesDir: "src/routes" },
  });

  try {
    const devResult = await devServer.start();
    console.log(
      `Dev server running on port ${devResult.port} (${devResult.pageRouteCount} pages, ${devResult.apiRouteCount} APIs)`,
    );

    await testMiddlewareAndLayouts(DEV_PORT, "DEV SERVER");
  } finally {
    await devServer.stop();
  }

  // ── PRODUCTION BUILD + SERVER ─────────────────────────────────────────────
  console.log("\n\nBuilding for production...");
  const distDir = resolve(root, "dist");

  await build({
    config: {
      root,
      routesDir: "src/routes",
      appContainerId: "app",
    },
    adapter,
    root,
    outDir: distDir,
    silent: true,
  });

  console.log("Starting production server...");
  const prodServer = new ProdServer({
    distDir,
    adapter,
    port: PROD_PORT,
    config: { appContainerId: "app" },
  });

  try {
    const prodResult = await prodServer.start();
    console.log(
      `Prod server running on port ${prodResult.port} (${prodResult.pageRouteCount} pages, ${prodResult.apiRouteCount} APIs)`,
    );

    await testMiddlewareAndLayouts(PROD_PORT, "PRODUCTION SERVER");
  } finally {
    await prodServer.stop();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  if (failed > 0) {
    console.log("\nSome tests FAILED!");
    process.exit(1);
  } else {
    console.log("\nAll tests passed!");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
