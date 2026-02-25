import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RouteManifest } from 'pyrajs-shared';

/** Build a minimal valid RouteManifest for use in plugin tests. */
function mockManifest(): RouteManifest {
  return {
    version: 1,
    adapter: 'react',
    base: '/',
    builtAt: new Date().toISOString(),
    renderMode: 'ssr',
    routes: {},
    assets: {},
  };
}

// ─── Mocks ────────────────────────────────────────────────────────────────────
// vi.mock() is hoisted above all imports by vitest, so image-plugin.ts gets the
// mocked optimizer when it is statically imported below. This removes the need
// for vi.resetModules() + dynamic imports, which bypassed the Vite alias and
// caused "Failed to resolve entry for pyrajs-shared" in CI environments where
// packages/shared/dist/ has not been built yet.
vi.mock('../image-optimizer.js', () => ({
  isSharpAvailable: vi.fn(),
  getImageMetadata: vi.fn(),
  optimizeImage: vi.fn(),
}));

import { pyraImages } from '../plugins/image-plugin.js';
import * as imageOptimizer from '../image-optimizer.js';

// ─── Filesystem helpers ───────────────────────────────────────────────────────

let tmpDir: string;

function writeFakeImage(relPath: string, content = 'fake-image-bytes'): string {
  const abs = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

// ─── Mock configuration helpers ───────────────────────────────────────────────

function mockSharpAvailable(
  buffer = Buffer.from('optimized-image-data'),
  metadata = { width: 1000, height: 750, format: 'jpeg' },
) {
  vi.mocked(imageOptimizer.isSharpAvailable).mockResolvedValue(true);
  vi.mocked(imageOptimizer.getImageMetadata).mockResolvedValue(metadata);
  vi.mocked(imageOptimizer.optimizeImage).mockResolvedValue({
    buffer,
    width: metadata.width,
    height: metadata.height,
    format: 'webp',
    size: buffer.length,
  });
}

function mockSharpUnavailable() {
  vi.mocked(imageOptimizer.isSharpAvailable).mockResolvedValue(false);
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyra-plugin-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

// ─── Plugin identity ──────────────────────────────────────────────────────────

describe('pyraImages() — plugin identity', () => {
  beforeEach(() => mockSharpAvailable());

  it('has name "pyra:images"', () => {
    const plugin = pyraImages();
    expect(plugin.name).toBe('pyra:images');
  });

  it('works with no arguments (all defaults)', () => {
    expect(() => pyraImages()).not.toThrow();
  });

  it('works with partial config', () => {
    expect(() => pyraImages({ formats: ['avif'], quality: 90 })).not.toThrow();
  });
});

// ─── Plugin hooks — buildEnd ──────────────────────────────────────────────────

describe('pyraImages() — buildEnd()', () => {
  beforeEach(() => mockSharpAvailable());

  it('sets manifest.images when variants were built', async () => {
    const plugin = pyraImages();
    const outDir = path.join(tmpDir, 'dist');
    writeFakeImage('public/hero.jpg');
    fs.mkdirSync(path.join(outDir, 'client', '_images'), { recursive: true });

    await plugin.setup?.({
      addEsbuildPlugin: vi.fn(),
      getConfig: vi.fn().mockReturnValue({
        root: tmpDir,
        build: { publicDir: 'public', outDir: 'dist' },
      }),
      getMode: vi.fn().mockReturnValue('production'),
    });
    await plugin.buildStart?.();

    const manifest: RouteManifest = mockManifest();
    plugin.buildEnd?.({ manifest, outDir, root: tmpDir });

    expect(manifest.images).toBeDefined();
    expect(typeof manifest.images).toBe('object');
  });

  it('does not set manifest.images when no images were found', async () => {
    const plugin = pyraImages();
    fs.mkdirSync(path.join(tmpDir, 'public'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'dist', 'client', '_images'), { recursive: true });

    await plugin.setup?.({
      addEsbuildPlugin: vi.fn(),
      getConfig: vi.fn().mockReturnValue({
        root: tmpDir,
        build: { publicDir: 'public', outDir: 'dist' },
      }),
      getMode: vi.fn().mockReturnValue('production'),
    });
    await plugin.buildStart?.();

    const manifest: RouteManifest = mockManifest();
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });

    expect(manifest.images).toBeUndefined();
  });

  it('buildEnd does not throw when called before buildStart', () => {
    const plugin = pyraImages();
    const manifest: RouteManifest = mockManifest();
    expect(() =>
      plugin.buildEnd?.({ manifest, outDir: tmpDir, root: tmpDir })
    ).not.toThrow();
  });
});

// ─── Plugin hooks — buildStart (sharp available) ──────────────────────────────

describe('pyraImages() — buildStart() with sharp available', () => {
  beforeEach(() =>
    mockSharpAvailable(
      Buffer.from('x'.repeat(1234)),
      { width: 1000, height: 750, format: 'jpeg' },
    )
  );

  async function setupPlugin(config: Record<string, unknown> = {}) {
    const plugin = pyraImages({ formats: ['webp'], sizes: [640, 1280], quality: 80 });
    fs.mkdirSync(path.join(tmpDir, 'public'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'dist', 'client', '_images'), { recursive: true });
    await plugin.setup?.({
      addEsbuildPlugin: vi.fn(),
      getConfig: vi.fn().mockReturnValue({
        root: tmpDir,
        build: { publicDir: 'public', outDir: 'dist' },
        ...config,
      }),
      getMode: vi.fn().mockReturnValue('production'),
    });
    return plugin;
  }

  it('skips when public dir has no images', async () => {
    const plugin = await setupPlugin();
    await expect(plugin.buildStart?.()).resolves.not.toThrow();
    const manifest: RouteManifest = mockManifest();
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    expect(manifest.images).toBeUndefined();
  });

  it('skips when public dir does not exist', async () => {
    const plugin = pyraImages({ formats: ['webp'] });
    await plugin.setup?.({
      addEsbuildPlugin: vi.fn(),
      getConfig: vi.fn().mockReturnValue({ root: tmpDir, build: { publicDir: 'nonexistent', outDir: 'dist' } }),
      getMode: vi.fn().mockReturnValue('production'),
    });
    await expect(plugin.buildStart?.()).resolves.not.toThrow();
  });

  it('processes images found in public/', async () => {
    writeFakeImage('public/hero.jpg');
    const plugin = await setupPlugin();
    await plugin.buildStart?.();
    const manifest: RouteManifest = mockManifest();
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    expect(manifest.images?.['/hero.jpg']).toBeDefined();
  });

  it('stores original dimensions in manifest entry', async () => {
    writeFakeImage('public/photo.jpg');
    const plugin = await setupPlugin();
    await plugin.buildStart?.();
    const manifest: RouteManifest = mockManifest();
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    const entry = manifest.images?.['/photo.jpg'];
    expect(entry?.originalWidth).toBe(1000);
    expect(entry?.originalHeight).toBe(750);
    expect(entry?.originalFormat).toBe('jpeg');
  });

  it('stores src as URL path with leading slash', async () => {
    writeFakeImage('public/banner.jpg');
    const plugin = await setupPlugin();
    await plugin.buildStart?.();
    const manifest: RouteManifest = mockManifest();
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    expect(Object.keys(manifest.images ?? {})[0]).toMatch(/^\/banner\.jpg$/);
  });

  it('uses forward slashes for nested image src paths', async () => {
    writeFakeImage('public/images/nested/photo.jpg');
    const plugin = await setupPlugin();
    await plugin.buildStart?.();
    const manifest: RouteManifest = mockManifest();
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    const key = Object.keys(manifest.images ?? {}).find(k => k.includes('nested'));
    expect(key).toBe('/images/nested/photo.jpg');
  });

  it('variant key uses format "${width}:${format}"', async () => {
    writeFakeImage('public/img.jpg');
    const plugin = await setupPlugin();
    await plugin.buildStart?.();
    const manifest: RouteManifest = mockManifest();
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    const entry = manifest.images?.['/img.jpg'];
    expect(Object.keys(entry?.variants ?? {})).toEqual(
      expect.arrayContaining(['640:webp'])
    );
  });

  it('variant path starts with "_images/"', async () => {
    writeFakeImage('public/img.jpg');
    const plugin = await setupPlugin();
    await plugin.buildStart?.();
    const manifest: RouteManifest = mockManifest();
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    const entry = manifest.images?.['/img.jpg'];
    for (const variant of Object.values(entry?.variants ?? {})) {
      expect(variant.path).toMatch(/^_images\//);
    }
  });

  it('variant filename includes stem, width, and format', async () => {
    writeFakeImage('public/hero.jpg');
    const plugin = await setupPlugin();
    await plugin.buildStart?.();
    const manifest: RouteManifest = mockManifest();
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    const entry = manifest.images?.['/hero.jpg'];
    const variant = entry?.variants['640:webp'];
    expect(variant?.path).toMatch(/hero-[a-f0-9]{8}-640w\.webp/);
  });

  it('never generates variants wider than the original image', async () => {
    writeFakeImage('public/small.jpg');
    const plugin = pyraImages({ formats: ['webp'], sizes: [640, 1280] });
    fs.mkdirSync(path.join(tmpDir, 'dist', 'client', '_images'), { recursive: true });
    await plugin.setup?.({
      addEsbuildPlugin: vi.fn(),
      getConfig: vi.fn().mockReturnValue({ root: tmpDir, build: { publicDir: 'public', outDir: 'dist' } }),
      getMode: vi.fn().mockReturnValue('production'),
    });
    await plugin.buildStart?.();
    const manifest: RouteManifest = mockManifest();
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    const entry = manifest.images?.['/small.jpg'];
    expect(entry?.variants['640:webp']).toBeDefined();
    expect(entry?.variants['1280:webp']).toBeUndefined();
  });

  it('writes variant files to the _images output directory', async () => {
    writeFakeImage('public/img.jpg');
    const plugin = await setupPlugin();
    await plugin.buildStart?.();
    const imagesDir = path.join(tmpDir, 'dist', 'client', '_images');
    const written = fs.readdirSync(imagesDir);
    expect(written.length).toBeGreaterThan(0);
    expect(written[0]).toMatch(/\.webp$/);
  });

  it('processes multiple images independently', async () => {
    writeFakeImage('public/a.jpg');
    writeFakeImage('public/b.png');
    const plugin = await setupPlugin();
    await plugin.buildStart?.();
    const manifest: RouteManifest = mockManifest();
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    expect(Object.keys(manifest.images ?? {})).toHaveLength(2);
  });

  it('ignores non-image files in public/', async () => {
    writeFakeImage('public/img.jpg');
    fs.writeFileSync(path.join(tmpDir, 'public', 'styles.css'), 'body {}');
    fs.writeFileSync(path.join(tmpDir, 'public', 'robots.txt'), 'User-agent: *');
    const plugin = await setupPlugin();
    await plugin.buildStart?.();
    const manifest: RouteManifest = mockManifest();
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    expect(Object.keys(manifest.images ?? {})).toHaveLength(1);
    expect(manifest.images?.['/img.jpg']).toBeDefined();
  });
});

// ─── Plugin hooks — buildStart (sharp unavailable) ───────────────────────────

describe('pyraImages() — buildStart() with sharp unavailable', () => {
  beforeEach(() => mockSharpUnavailable());

  it('returns without throwing when sharp is missing', async () => {
    writeFakeImage('public/hero.jpg');
    const plugin = pyraImages();
    fs.mkdirSync(path.join(tmpDir, 'dist', 'client', '_images'), { recursive: true });
    await plugin.setup?.({
      addEsbuildPlugin: vi.fn(),
      getConfig: vi.fn().mockReturnValue({ root: tmpDir, build: { publicDir: 'public', outDir: 'dist' } }),
      getMode: vi.fn().mockReturnValue('production'),
    });
    await expect(plugin.buildStart?.()).resolves.not.toThrow();
  });

  it('does not populate manifest.images when sharp is missing', async () => {
    writeFakeImage('public/hero.jpg');
    const plugin = pyraImages();
    fs.mkdirSync(path.join(tmpDir, 'dist', 'client', '_images'), { recursive: true });
    await plugin.setup?.({
      addEsbuildPlugin: vi.fn(),
      getConfig: vi.fn().mockReturnValue({ root: tmpDir, build: { publicDir: 'public', outDir: 'dist' } }),
      getMode: vi.fn().mockReturnValue('production'),
    });
    await plugin.buildStart?.();
    const manifest: RouteManifest = mockManifest();
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    expect(manifest.images).toBeUndefined();
  });
});

// ─── config() hook ────────────────────────────────────────────────────────────

describe('pyraImages() — config() hook', () => {
  beforeEach(() => mockSharpAvailable());

  it('returns null (does not mutate config)', () => {
    const plugin = pyraImages();
    const result = plugin.config?.({ root: '/app' }, 'production');
    expect(result).toBeNull();
  });

  it('config hook is defined', () => {
    const plugin = pyraImages();
    expect(typeof plugin.config).toBe('function');
  });
});
