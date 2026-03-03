import { describe, it, expect } from 'vitest';
import { createRouter } from '../router.js';
import type { RouteNode } from '@pyra/shared';
import type { ScanResult, ScannedLayout } from '../scanner.js';

// ─── Builders ────────────────────────────────────────────────────────────────

function makeRoute(overrides: Partial<RouteNode> & { id: string; pattern: string }): RouteNode {
  return {
    type: 'page',
    filePath: `/routes${overrides.id}/page.tsx`,
    params: [],
    catchAll: false,
    middlewarePaths: [],
    children: [],
    ...overrides,
  };
}

function makeScanResult(
  routes: RouteNode[],
  layouts: ScannedLayout[] = [],
): ScanResult {
  return { routes, layouts, middlewares: [], errors: [] };
}

// ─── Basic matching ───────────────────────────────────────────────────────────

describe('createRouter — root route', () => {
  it('matches "/" exactly', () => {
    const router = createRouter(makeScanResult([
      makeRoute({ id: '/', pattern: '/' }),
    ]));
    const m = router.match('/');
    expect(m).not.toBeNull();
    expect(m!.route.id).toBe('/');
    expect(m!.params).toEqual({});
  });
});

describe('createRouter — static routes', () => {
  const router = createRouter(makeScanResult([
    makeRoute({ id: '/', pattern: '/' }),
    makeRoute({ id: '/about', pattern: '/about' }),
    makeRoute({ id: '/about/team', pattern: '/about/team' }),
  ]));

  it('matches a single-segment static route', () => {
    expect(router.match('/about')?.route.id).toBe('/about');
  });

  it('matches a two-segment static route', () => {
    expect(router.match('/about/team')?.route.id).toBe('/about/team');
  });

  it('returns null for an unregistered path', () => {
    expect(router.match('/contact')).toBeNull();
  });

  it('returns null when there are too many segments', () => {
    expect(router.match('/about/team/extra')).toBeNull();
  });
});

describe('createRouter — dynamic routes', () => {
  const router = createRouter(makeScanResult([
    makeRoute({ id: '/blog', pattern: '/blog' }),
    makeRoute({ id: '/blog/[slug]', pattern: '/blog/:slug', params: ['slug'] }),
  ]));

  it('extracts a dynamic param', () => {
    const m = router.match('/blog/hello-world');
    expect(m?.route.id).toBe('/blog/[slug]');
    expect(m?.params).toEqual({ slug: 'hello-world' });
  });

  it('static beats dynamic at the same depth', () => {
    expect(router.match('/blog')?.route.id).toBe('/blog');
  });
});

describe('createRouter — multiple dynamic params', () => {
  const router = createRouter(makeScanResult([
    makeRoute({
      id: '/users/[userId]/posts/[postId]',
      pattern: '/users/:userId/posts/:postId',
      params: ['userId', 'postId'],
    }),
  ]));

  it('extracts two params', () => {
    const m = router.match('/users/42/posts/99');
    expect(m?.params).toEqual({ userId: '42', postId: '99' });
  });
});

describe('createRouter — catch-all routes', () => {
  const router = createRouter(makeScanResult([
    makeRoute({ id: '/docs', pattern: '/docs' }),
    makeRoute({
      id: '/docs/[...path]',
      pattern: '/docs/*path',
      params: ['path'],
      catchAll: true,
    }),
  ]));

  it('static /docs takes priority', () => {
    expect(router.match('/docs')?.route.id).toBe('/docs');
  });

  it('catch-all matches a single extra segment', () => {
    const m = router.match('/docs/getting-started');
    expect(m?.route.id).toBe('/docs/[...path]');
    expect(m?.params.path).toBe('getting-started');
  });

  it('catch-all matches multiple extra segments', () => {
    const m = router.match('/docs/guide/installation/windows');
    expect(m?.params.path).toBe('guide/installation/windows');
  });
});

describe('createRouter — trailing slash normalization', () => {
  const router = createRouter(makeScanResult([
    makeRoute({ id: '/about', pattern: '/about' }),
  ]));

  it('matches /about/ by stripping the trailing slash', () => {
    expect(router.match('/about/')?.route.id).toBe('/about');
  });

  it('still matches /about without a trailing slash', () => {
    expect(router.match('/about')?.route.id).toBe('/about');
  });
});

describe('createRouter — API routes', () => {
  const router = createRouter(makeScanResult([
    makeRoute({ id: '/api/health', pattern: '/api/health', type: 'api' }),
    makeRoute({ id: '/api/users/[id]', pattern: '/api/users/:id', type: 'api', params: ['id'] }),
  ]));

  it('matches an API route and returns its type', () => {
    expect(router.match('/api/health')?.route.type).toBe('api');
  });

  it('extracts params from an API route', () => {
    const m = router.match('/api/users/123');
    expect(m?.route.id).toBe('/api/users/[id]');
    expect(m?.params.id).toBe('123');
  });
});

// ─── RouteGraph accessors ─────────────────────────────────────────────────────

describe('createRouter — pageRoutes() and apiRoutes()', () => {
  const router = createRouter(makeScanResult([
    makeRoute({ id: '/', pattern: '/', type: 'page' }),
    makeRoute({ id: '/about', pattern: '/about', type: 'page' }),
    makeRoute({ id: '/api/health', pattern: '/api/health', type: 'api' }),
  ]));

  it('pageRoutes() returns only page routes', () => {
    const pages = router.pageRoutes();
    expect(pages).toHaveLength(2);
    expect(pages.every(r => r.type === 'page')).toBe(true);
  });

  it('apiRoutes() returns only API routes', () => {
    const apis = router.apiRoutes();
    expect(apis).toHaveLength(1);
    expect(apis[0].id).toBe('/api/health');
  });
});

describe('createRouter — get()', () => {
  const router = createRouter(makeScanResult([
    makeRoute({ id: '/blog/[slug]', pattern: '/blog/:slug', params: ['slug'] }),
  ]));

  it('retrieves a route by ID', () => {
    expect(router.get('/blog/[slug]')?.id).toBe('/blog/[slug]');
  });

  it('returns undefined for an unknown ID', () => {
    expect(router.get('/nonexistent')).toBeUndefined();
  });
});

describe('createRouter — toJSON()', () => {
  const router = createRouter(makeScanResult([
    makeRoute({ id: '/blog/[slug]', pattern: '/blog/:slug', params: ['slug'] }),
  ]));

  it('returns a serializable snapshot', () => {
    const json = router.toJSON();
    expect(json.routes['/blog/[slug]']).toBeDefined();
    expect(json.routes['/blog/[slug]'].pattern).toBe('/blog/:slug');
    expect(json.routes['/blog/[slug]'].params).toEqual(['slug']);
  });
});

// ─── Layout chain ─────────────────────────────────────────────────────────────

describe('createRouter — layout chains', () => {
  const layouts: ScannedLayout[] = [
    { id: '/', filePath: '/routes/layout.tsx' },
    { id: '/blog', filePath: '/routes/blog/layout.tsx' },
  ];

  const router = createRouter(makeScanResult(
    [
      makeRoute({ id: '/', pattern: '/' }),
      makeRoute({ id: '/blog', pattern: '/blog' }),
      makeRoute({ id: '/blog/[slug]', pattern: '/blog/:slug', params: ['slug'] }),
    ],
    layouts,
  ));

  it('root route gets root layout only', () => {
    const m = router.match('/');
    expect(m?.layouts).toHaveLength(1);
    expect(m?.layouts[0].id).toBe('/');
  });

  it('/blog gets root layout + blog layout (outermost first)', () => {
    const m = router.match('/blog');
    expect(m?.layouts).toHaveLength(2);
    expect(m?.layouts[0].id).toBe('/');
    expect(m?.layouts[1].id).toBe('/blog');
  });

  it('/blog/[slug] gets both layouts', () => {
    const m = router.match('/blog/hello');
    expect(m?.layouts).toHaveLength(2);
    expect(m?.layouts[0].id).toBe('/');
    expect(m?.layouts[1].id).toBe('/blog');
  });

  it('route with no applicable layout returns empty layouts array', () => {
    const bare = createRouter(makeScanResult([
      makeRoute({ id: '/contact', pattern: '/contact' }),
    ]));
    expect(bare.match('/contact')?.layouts).toHaveLength(0);
  });
});

// ─── Collision detection ──────────────────────────────────────────────────────

describe('createRouter — route collision throws', () => {
  it('throws when two routes resolve to the same pattern', () => {
    expect(() => createRouter(makeScanResult([
      makeRoute({ id: '/a', pattern: '/a' }),
      makeRoute({ id: '/a-duplicate', pattern: '/a' }),
    ]))).toThrow(/collision/i);
  });
});
