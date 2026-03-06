import { describe, it, expect } from 'vitest';
import { resolveRouteRenderMode } from '../render-mode.js';

// ─── Explicit render export ───────────────────────────────────────────────────

describe('resolveRouteRenderMode — explicit render export', () => {
  it('returns "spa" when mod.render is "spa"', () => {
    expect(resolveRouteRenderMode({ render: 'spa' }, 'ssr')).toBe('spa');
  });

  it('returns "ssr" when mod.render is "ssr"', () => {
    expect(resolveRouteRenderMode({ render: 'ssr' }, 'ssg')).toBe('ssr');
  });

  it('returns "ssg" when mod.render is "ssg"', () => {
    expect(resolveRouteRenderMode({ render: 'ssg' }, 'ssr')).toBe('ssg');
  });

  it('explicit render takes priority over prerender export', () => {
    expect(resolveRouteRenderMode({ render: 'spa', prerender: true }, 'ssr')).toBe('spa');
  });

  it('ignores an invalid render value and falls back to global default', () => {
    expect(resolveRouteRenderMode({ render: 'invalid' }, 'ssr')).toBe('ssr');
  });

  it('ignores a numeric render value', () => {
    expect(resolveRouteRenderMode({ render: 42 }, 'spa')).toBe('spa');
  });
});

// ─── Legacy prerender export ──────────────────────────────────────────────────

describe('resolveRouteRenderMode — prerender export (legacy SSG)', () => {
  it('returns "ssg" when prerender is true', () => {
    expect(resolveRouteRenderMode({ prerender: true }, 'ssr')).toBe('ssg');
  });

  it('returns "ssg" when prerender is an object with paths()', () => {
    expect(resolveRouteRenderMode({ prerender: { paths: () => [] } }, 'ssr')).toBe('ssg');
  });

  it('falls through to global default when prerender is false', () => {
    expect(resolveRouteRenderMode({ prerender: false }, 'ssr')).toBe('ssr');
  });

  it('falls through to global default when prerender is undefined', () => {
    expect(resolveRouteRenderMode({ prerender: undefined }, 'spa')).toBe('spa');
  });
});

// ─── Global default ───────────────────────────────────────────────────────────

describe('resolveRouteRenderMode — global default fallback', () => {
  it('returns the global default when mod has no relevant exports', () => {
    expect(resolveRouteRenderMode({}, 'ssr')).toBe('ssr');
    expect(resolveRouteRenderMode({}, 'spa')).toBe('spa');
    expect(resolveRouteRenderMode({}, 'ssg')).toBe('ssg');
  });
});
