/**
 * v0.1 Router Verification Script
 *
 * Tests the scanner + router against the test route structure.
 * Run from repo root: node test-routes/verify-router.mjs
 */
import { scanRoutes, createRouter } from '../packages/core/dist/index.js';
import { resolve } from 'node:path';

const routesDir = resolve(import.meta.dirname, 'src/routes');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  assert(actualStr === expectedStr, `${message} (got ${actualStr})`);
}

// ─── Phase 1: Test the scanner ────────────────────────────────────────────────

console.log('\n=== Phase 1: Route Scanner ===\n');

const scanResult = await scanRoutes(routesDir, ['.tsx', '.jsx']);

console.log('Discovered routes:');
for (const route of scanResult.routes) {
  console.log(`  ${route.type.padEnd(4)} ${route.id.padEnd(25)} → ${route.pattern}`);
}

console.log('\nDiscovered layouts:');
for (const layout of scanResult.layouts) {
  console.log(`  ${layout.id}`);
}

console.log('\nDiscovered middlewares:');
for (const mw of scanResult.middlewares) {
  console.log(`  ${mw.dirId}`);
}

// Expected routes
const expectedRouteIds = [
  '/',
  '/about',
  '/blog',
  '/blog/[slug]',
  '/dashboard',
  '/dashboard/settings',
  '/api/health',
  '/api/users',
  '/api/users/[id]',
];

console.log('\n--- Scanner assertions ---\n');

assert(
  scanResult.routes.length === expectedRouteIds.length,
  `Found ${scanResult.routes.length} routes (expected ${expectedRouteIds.length})`,
);

for (const id of expectedRouteIds) {
  assert(
    scanResult.routes.some(r => r.id === id),
    `Route "${id}" was discovered`,
  );
}

// Check page vs API types
assert(
  scanResult.routes.find(r => r.id === '/')?.type === 'page',
  'Root route is a page route',
);
assert(
  scanResult.routes.find(r => r.id === '/api/health')?.type === 'api',
  '/api/health is an API route',
);
assert(
  scanResult.routes.find(r => r.id === '/api/users/[id]')?.type === 'api',
  '/api/users/[id] is an API route',
);

// Check layouts
assert(scanResult.layouts.length === 2, `Found 2 layouts (root + blog)`);
assert(
  scanResult.layouts.some(l => l.id === '/'),
  'Root layout discovered',
);
assert(
  scanResult.layouts.some(l => l.id === '/blog'),
  'Blog layout discovered',
);

// Check middlewares
assert(scanResult.middlewares.length === 2, `Found 2 middlewares (root + dashboard)`);

// Check layout ancestry
const blogSlugRoute = scanResult.routes.find(r => r.id === '/blog/[slug]');
assert(
  blogSlugRoute?.layoutId === '/blog',
  `/blog/[slug] nearest layout is /blog (got ${blogSlugRoute?.layoutId})`,
);

const aboutRoute = scanResult.routes.find(r => r.id === '/about');
assert(
  aboutRoute?.layoutId === '/',
  `/about nearest layout is / (got ${aboutRoute?.layoutId})`,
);

// Check middleware ancestry
const dashSettingsRoute = scanResult.routes.find(r => r.id === '/dashboard/settings');
assert(
  dashSettingsRoute?.middlewarePaths.length === 2,
  `/dashboard/settings has 2 middleware files (root + dashboard)`,
);

const aboutMw = scanResult.routes.find(r => r.id === '/about');
assert(
  aboutMw?.middlewarePaths.length === 1,
  `/about has 1 middleware file (root only)`,
);

// Check params extraction
assert(
  blogSlugRoute?.params.length === 1 && blogSlugRoute.params[0] === 'slug',
  `/blog/[slug] has param "slug"`,
);

const userIdRoute = scanResult.routes.find(r => r.id === '/api/users/[id]');
assert(
  userIdRoute?.params.length === 1 && userIdRoute.params[0] === 'id',
  `/api/users/[id] has param "id"`,
);

// ─── Phase 2: Test the router/matcher ─────────────────────────────────────────

console.log('\n=== Phase 2: URL Matcher ===\n');

const router = createRouter(scanResult);

// Test: root route
const rootMatch = router.match('/');
assert(rootMatch !== null, 'GET / matches');
assert(rootMatch?.route.id === '/', 'GET / matches route "/"');
assertDeepEqual(rootMatch?.params, {}, 'GET / has no params');
assert(rootMatch?.layouts.length === 1, 'GET / has 1 layout (root)');

// Test: static route
const aboutMatch = router.match('/about');
assert(aboutMatch !== null, 'GET /about matches');
assert(aboutMatch?.route.id === '/about', 'GET /about matches route "/about"');

// Test: dynamic route with param extraction
const blogPostMatch = router.match('/blog/hello-world');
assert(blogPostMatch !== null, 'GET /blog/hello-world matches');
assert(blogPostMatch?.route.id === '/blog/[slug]', 'GET /blog/hello-world matches /blog/[slug]');
assertDeepEqual(blogPostMatch?.params, { slug: 'hello-world' }, 'Extracted slug param');

// Test: static route takes priority over dynamic
const blogListMatch = router.match('/blog');
assert(blogListMatch?.route.id === '/blog', 'GET /blog matches /blog (static), not /blog/[slug]');

// Test: nested static route
const settingsMatch = router.match('/dashboard/settings');
assert(settingsMatch !== null, 'GET /dashboard/settings matches');
assert(settingsMatch?.route.id === '/dashboard/settings', 'Matches /dashboard/settings');

// Test: layout chain for nested route
assert(
  blogPostMatch?.layouts.length === 2,
  `/blog/hello-world has 2 layouts (root + blog)`,
);
assert(
  blogPostMatch?.layouts[0].id === '/',
  'First layout is root',
);
assert(
  blogPostMatch?.layouts[1].id === '/blog',
  'Second layout is blog',
);

// Test: API routes
const healthMatch = router.match('/api/health');
assert(healthMatch !== null, 'GET /api/health matches');
assert(healthMatch?.route.type === 'api', '/api/health is an API route');

// Test: dynamic API route
const userMatch = router.match('/api/users/42');
assert(userMatch !== null, 'GET /api/users/42 matches');
assert(userMatch?.route.id === '/api/users/[id]', 'Matches /api/users/[id]');
assertDeepEqual(userMatch?.params, { id: '42' }, 'Extracted id param');

// Test: 404 — no match
const noMatch = router.match('/nonexistent');
assert(noMatch === null, 'GET /nonexistent returns null (404)');

const noMatch2 = router.match('/blog/hello/extra/segments');
assert(noMatch2 === null, 'GET /blog/hello/extra/segments returns null (too many segments)');

// Test: trailing slash normalization
const trailingSlash = router.match('/about/');
assert(trailingSlash?.route.id === '/about', 'GET /about/ matches /about (trailing slash normalized)');

// Test: RouteGraph accessors
assert(router.pageRoutes().length === 6, `pageRoutes() returns 6 page routes`);
assert(router.apiRoutes().length === 3, `apiRoutes() returns 3 API routes`);
assert(router.get('/blog/[slug]')?.type === 'page', `get('/blog/[slug]') works`);
assert(router.get('/nonexistent') === undefined, `get('/nonexistent') returns undefined`);

// Test: toJSON
const json = router.toJSON();
assert(Object.keys(json.routes).length === 9, 'toJSON has 9 routes');
assert(json.routes['/blog/[slug]']?.pattern === '/blog/:slug', 'toJSON pattern is correct');

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
