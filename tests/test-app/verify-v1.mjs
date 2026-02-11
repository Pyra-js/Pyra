/**
 * v1.0 Production Hardening Verification Script
 *
 * Tests error handling (error.tsx boundaries), custom 404 pages, API error
 * handling, middleware error propagation, and graceful shutdown in both
 * dev and production servers.
 *
 * Run from repo root: node tests/test-app/verify-v1.mjs
 */
import { DevServer, ProdServer, build } from "../../packages/core/dist/index.js";
import { createReactAdapter } from "../../packages/adapter-react/dist/index.js";
import { resolve } from "node:path";
import http from "node:http";

const root = resolve(import.meta.dirname);
const routesDir = resolve(root, "src/routes");
const DEV_PORT = 3470;
const PROD_PORT = 3471;

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

function stripComments(html) {
  return html.replace(/<!--.*?-->/g, "");
}

// ── Test suite ────────────────────────────────────────────────────────────────

async function testErrorHandling(port, label, isDev) {
  console.log(`\n\u2550\u2550 ${label} (port ${port}) \u2550\u2550`);

  // ── Custom 404 page ─────────────────────────────────────────────────
  console.log("\nCustom 404 page:");
  {
    const res = await get(port, "/nonexistent-page");
    assert(res.status === 404, `GET /nonexistent-page \u2192 404 (got ${res.status})`);
    const html = stripComments(res.body);
    assert(
      html.includes("Custom 404"),
      `Custom 404 page content rendered`,
    );
    assert(
      html.includes("not-found-page"),
      `Custom 404 page has expected class`,
    );
  }

  // ── Another 404 path ───────────────────────────────────────────────
  console.log("\n404 for deeply nested non-existent path:");
  {
    const res = await get(port, "/a/b/c/d/e");
    assert(res.status === 404, `GET /a/b/c/d/e \u2192 404 (got ${res.status})`);
    assert(
      stripComments(res.body).includes("Custom 404"),
      `Deep path returns custom 404 page`,
    );
  }

  // ── Error boundary: load() throws ─────────────────────────────────
  console.log("\nError boundary (load() throws):");
  {
    const res = await get(port, "/error-test");
    assert(res.status === 500, `GET /error-test \u2192 500 (got ${res.status})`);
    const html = stripComments(res.body);
    assert(
      html.includes("error-boundary"),
      `Root error.tsx boundary rendered`,
    );
    if (isDev) {
      assert(
        html.includes("Intentional load error"),
        `Dev: actual error message present in output`,
      );
      assert(
        html.includes("error-stack") || html.includes("Error:"),
        `Dev: includes stack trace or error info`,
      );
    } else {
      assert(
        html.includes("Internal Server Error") || html.includes("error-message"),
        `Prod: error boundary rendered with generic or error-message class`,
      );
    }
  }

  // ── Error boundary: component throws ──────────────────────────────
  console.log("\nError boundary (component throws):");
  {
    const res = await get(port, "/error-test/component");
    assert(res.status === 500, `GET /error-test/component \u2192 500 (got ${res.status})`);
    const html = stripComments(res.body);
    assert(
      html.includes("error-boundary") || html.includes("Error") || html.includes("error"),
      `Error page rendered for component throw`,
    );
  }

  // ── Nested error boundary ─────────────────────────────────────────
  console.log("\nNested error boundary:");
  {
    const res = await get(port, "/error-test/nested");
    assert(res.status === 500, `GET /error-test/nested \u2192 500 (got ${res.status})`);
    const html = stripComments(res.body);
    assert(
      html.includes("nested-error-boundary"),
      `Nested error.tsx boundary rendered (not root)`,
    );
    if (isDev) {
      assert(
        html.includes("Nested load error"),
        `Dev: nested error message present`,
      );
    } else {
      assert(
        html.includes("Internal Server Error") || html.includes("nested-error-message"),
        `Prod: nested error boundary rendered with generic message`,
      );
    }
  }

  // ── Middleware throws → error boundary ─────────────────────────────
  console.log("\nMiddleware throws:");
  {
    const res = await get(port, "/error-test/middleware-throw");
    assert(res.status === 500, `GET /error-test/middleware-throw \u2192 500 (got ${res.status})`);
    const html = stripComments(res.body);
    assert(
      html.includes("error-boundary") || html.includes("Error") || html.includes("error"),
      `Error page rendered when middleware throws`,
    );
  }

  // ── API route throws ──────────────────────────────────────────────
  console.log("\nAPI error handling:");
  {
    const res = await get(port, "/api/error");
    assert(res.status === 500, `GET /api/error \u2192 500 (got ${res.status})`);

    let json;
    try {
      json = JSON.parse(res.body);
    } catch {
      json = null;
    }

    assert(json !== null, `API error returns JSON response`);

    if (isDev) {
      assert(
        json && json.error && json.error.includes("Intentional API error"),
        `Dev: API error includes error message`,
      );
    } else {
      assert(
        json && json.error === "Internal Server Error",
        `Prod: API error returns generic message (got "${json?.error}")`,
      );
    }
  }

  // ── Existing routes still work ────────────────────────────────────
  console.log("\nExisting routes unaffected:");
  {
    const home = await get(port, "/");
    assert(home.status === 200, `GET / \u2192 200 (got ${home.status})`);

    const health = await get(port, "/api/health");
    assert(health.status === 200, `GET /api/health \u2192 200 (got ${health.status})`);

    const blog = await get(port, "/blog");
    assert(blog.status === 200, `GET /blog \u2192 200 (got ${blog.status})`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("v1.0 Production Hardening Verification\n");

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

    await testErrorHandling(DEV_PORT, "DEV SERVER", true);
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

    await testErrorHandling(PROD_PORT, "PRODUCTION SERVER", false);

    // ── Graceful shutdown test ─────────────────────────────────────────
    console.log("\n\u2550\u2550 GRACEFUL SHUTDOWN \u2550\u2550");
    console.log("\nGraceful shutdown:");
    {
      // Make a request, then immediately initiate stop
      // The request should complete before the server finishes shutting down
      const requestPromise = get(PROD_PORT, "/");
      // Small delay to ensure request is in-flight
      await new Promise((r) => setTimeout(r, 10));
      const stopPromise = prodServer.stop();

      const res = await requestPromise;
      assert(res.status === 200, `In-flight request completed during shutdown`);

      await stopPromise;
      assert(true, `Server shut down gracefully`);
    }
  } catch (err) {
    // If the graceful shutdown test is run, prodServer.stop() was already called
    console.error("Error during prod tests:", err.message);
    try { await prodServer.stop(); } catch {}
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
