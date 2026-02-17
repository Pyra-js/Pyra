import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  escapeJsonForScript,
  createBuildTimeRequestContext,
  createRequestContext,
  getSetCookieHeaders,
} from '../request-context.js';
import http from 'node:http';

// ─── escapeJsonForScript ──────────────────────────────────────────────────────

describe('escapeJsonForScript', () => {
  it('escapes < to prevent </script> injection', () => {
    expect(escapeJsonForScript('</script>')).toBe('\\u003c/script\\u003e');
  });

  it('escapes > characters', () => {
    expect(escapeJsonForScript('a>b')).toBe('a\\u003eb');
  });

  it('escapes & characters', () => {
    expect(escapeJsonForScript('a&b')).toBe('a\\u0026b');
  });

  it('escapes a realistic JSON payload', () => {
    const json = JSON.stringify({ html: '<b>bold</b>', query: 'a&b' });
    const escaped = escapeJsonForScript(json);
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
    expect(escaped).not.toContain('&');
  });

  it('leaves plain strings untouched', () => {
    expect(escapeJsonForScript('hello world')).toBe('hello world');
  });
});

// ─── createBuildTimeRequestContext ────────────────────────────────────────────

describe('createBuildTimeRequestContext', () => {
  it('sets the request URL from pathname', () => {
    const ctx = createBuildTimeRequestContext({
      pathname: '/about',
      params: {},
      routeId: '/about',
    });
    expect(ctx.url.pathname).toBe('/about');
  });

  it('sets the route ID', () => {
    const ctx = createBuildTimeRequestContext({
      pathname: '/blog/hello',
      params: { slug: 'hello' },
      routeId: '/blog/[slug]',
    });
    expect(ctx.routeId).toBe('/blog/[slug]');
  });

  it('exposes params', () => {
    const ctx = createBuildTimeRequestContext({
      pathname: '/blog/hello',
      params: { slug: 'hello' },
      routeId: '/blog/[slug]',
    });
    expect(ctx.params.slug).toBe('hello');
  });

  it('always sets mode to production', () => {
    const ctx = createBuildTimeRequestContext({
      pathname: '/',
      params: {},
      routeId: '/',
    });
    expect(ctx.mode).toBe('production');
  });

  it('request method is GET', () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    expect(ctx.request.method).toBe('GET');
  });

  // Response helpers
  it('json() creates a JSON response', async () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    const res = ctx.json({ ok: true });
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('html() creates an HTML response', async () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    const res = ctx.html('<h1>Hello</h1>');
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(await res.text()).toBe('<h1>Hello</h1>');
  });

  it('redirect() creates a 302 response by default', () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    const res = ctx.redirect('/login');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('redirect() accepts a custom status code', () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    const res = ctx.redirect('/new-location', 301);
    expect(res.status).toBe(301);
  });

  it('text() creates a plain text response', async () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    const res = ctx.text('hello');
    expect(res.headers.get('content-type')).toBe('text/plain');
    expect(await res.text()).toBe('hello');
  });
});

// ─── CookieJar ───────────────────────────────────────────────────────────────

describe('CookieJar', () => {
  it('starts empty when no cookie header is provided', () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    expect(ctx.cookies.getAll()).toEqual({});
  });

  it('parses cookies from createRequestContext', () => {
    const req = new http.IncomingMessage(null as any);
    req.method = 'GET';
    req.url = '/';
    (req as any).headers = { host: 'localhost', cookie: 'session=abc; user=alice' };

    const ctx = createRequestContext({
      req,
      params: {},
      routeId: '/',
      mode: 'development',
    });

    expect(ctx.cookies.get('session')).toBe('abc');
    expect(ctx.cookies.get('user')).toBe('alice');
  });

  it('get() returns undefined for a missing cookie', () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    expect(ctx.cookies.get('nonexistent')).toBeUndefined();
  });

  it('set() adds a cookie and makes it retrievable', () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    ctx.cookies.set('theme', 'dark');
    expect(ctx.cookies.get('theme')).toBe('dark');
  });

  it('delete() marks a cookie for removal', () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    ctx.cookies.set('temp', 'value');
    ctx.cookies.delete('temp');
    // delete() internally calls set(name, '', { maxAge: 0 }) which clears the parsed map
    // but re-adds with empty string — the Set-Cookie header with Max-Age=0 is what matters
    const setCookies = getSetCookieHeaders(ctx);
    const deleteHeader = setCookies.find(h => h.includes('Max-Age=0'));
    expect(deleteHeader).toBeDefined();
  });

  it('set() queues a Set-Cookie header', () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    ctx.cookies.set('token', 'xyz123');
    const setCookies = getSetCookieHeaders(ctx);
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toContain('token=');
    expect(setCookies[0]).toContain('xyz123');
  });

  it('delete() queues a Max-Age=0 Set-Cookie header', () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    ctx.cookies.set('session', 'val');
    ctx.cookies.delete('session');
    const setCookies = getSetCookieHeaders(ctx);
    // [0] is the set, the delete internally calls set with Max-Age=0
    const deleteHeader = setCookies.find(h => h.includes('Max-Age=0'));
    expect(deleteHeader).toBeDefined();
  });

  it('set() with options includes Path and HttpOnly', () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    ctx.cookies.set('auth', 'tok', { path: '/', httpOnly: true, maxAge: 3600 });
    const setCookies = getSetCookieHeaders(ctx);
    expect(setCookies[0]).toContain('Path=/');
    expect(setCookies[0]).toContain('HttpOnly');
    expect(setCookies[0]).toContain('Max-Age=3600');
  });

  it('set() with sameSite capitalizes the value', () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    ctx.cookies.set('c', 'v', { sameSite: 'lax' });
    expect(getSetCookieHeaders(ctx)[0]).toContain('SameSite=Lax');
  });
});

// ─── filterEnv ───────────────────────────────────────────────────────────────

describe('filterEnv / env field on RequestContext', () => {
  beforeEach(() => {
    process.env['PYRA_API_URL'] = 'https://api.example.com';
    process.env['SECRET_KEY'] = 'should-not-appear';
  });

  afterEach(() => {
    delete process.env['PYRA_API_URL'];
    delete process.env['SECRET_KEY'];
  });

  it('includes PYRA_-prefixed vars with the prefix stripped', () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    expect(ctx.env['API_URL']).toBe('https://api.example.com');
  });

  it('excludes vars without the PYRA_ prefix', () => {
    const ctx = createBuildTimeRequestContext({ pathname: '/', params: {}, routeId: '/' });
    expect(ctx.env['SECRET_KEY']).toBeUndefined();
  });
});
