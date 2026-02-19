import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RouteManifest } from 'pyrajs-shared';

// ─── Filesystem helpers ───────────────────────────────────────────────────────

let tmpDir: string;

function writeFakeImage(relPath: string, content = 'fake-image-bytes'): string {
  const abs = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

/** Resets module registry so fresh imports get fresh module-level state. */
function resetAndMockOptimizer(overrides: {
  available?: boolean;
  metadata?: { width: number; height: number; format: string };
  buffer?: Buffer;
} = {}) {
  vi.resetModules();
  const available = overrides.available ?? true;
  const metadata = overrides.metadata ?? { width: 1000, height: 750, format: 'jpeg' };
  const buffer = overrides.buffer ?? Buffer.from('optimized-image-data');

  vi.doMock('../image-optimizer.js', () => ({
    isSharpAvailable: vi.fn().mockResolvedValue(available),
    getImageMetadata: vi.fn().mockResolvedValue(metadata),
    optimizeImage: vi.fn().mockResolvedValue({
      buffer,
      width: metadata.width,
      height: metadata.height,
      format: 'webp',
      size: buffer.length,
    }),
  }));
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyra-plugin-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.doUnmock('../image-optimizer.js');
});

// ─── Plugin identity ─────────────────────────────────────────────────────────

describe('pyraImages() — plugin identity', () => {
  beforeEach(() => resetAndMockOptimizer());

  it('has name "pyra:images"', async () => {
    const { pyraImages } = await import('../plugins/image-plugin.js');
    const plugin = pyraImages();
    expect(plugin.name).toBe('pyra:images');
  });

  it('works with no arguments (all defaults)', async () => {
    const { pyraImages } = await import('../plugins/image-plugin.js');
    expect(() => pyraImages()).not.toThrow();
  });

  it('works with partial config', async () => {
    const { pyraImages } = await import('../plugins/image-plugin.js');
    expect(() => pyraImages({ formats: ['avif'], quality: 90 })).not.toThrow();
  });
});

// ─── Plugin hooks — buildEnd ──────────────────────────────────────────────────

describe('pyraImages() — buildEnd()', () => {
  beforeEach(() => resetAndMockOptimizer());

  it('sets manifest.images when variants were built', async () => {
    const { pyraImages } = await import('../plugins/image-plugin.js');
    const plugin = pyraImages();

    // Seed internal builtImages by simulating a successful buildStart
    const publicDir = path.join(tmpDir, 'public');
    const outDir = path.join(tmpDir, 'dist');
    writeFakeImage('public/hero.jpg');
    fs.mkdirSync(path.join(outDir, 'client', '_images'), { recursive: true });

    // Simulate setup and buildStart lifecycle
    await plugin.setup?.({
      addEsbuildPlugin: vi.fn(),
      getConfig: vi.fn().mockReturnValue({
        root: tmpDir,
        build: { publicDir: 'public', outDir: 'dist' },
      }),
      getMode: vi.fn().mockReturnValue('production'),
    });
    await plugin.buildStart?.();

    const manifest: RouteManifest = { routes: {} };
    plugin.buildEnd?.({ manifest, outDir, root: tmpDir });

    expect(manifest.images).toBeDefined();
    expect(typeof manifest.images).toBe('object');
  });

  it('does not set manifest.images when no images were found', async () => {
    const { pyraImages } = await import('../plugins/image-plugin.js');
    const plugin = pyraImages();

    // Empty public dir — no images
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

    const manifest: RouteManifest = { routes: {} };
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });

    expect(manifest.images).toBeUndefined();
  });

  it('buildEnd does not throw when called before buildStart', async () => {
    const { pyraImages } = await import('../plugins/image-plugin.js');
    const plugin = pyraImages();
    const manifest: RouteManifest = { routes: {} };
    expect(() =>
      plugin.buildEnd?.({ manifest, outDir: tmpDir, root: tmpDir })
    ).not.toThrow();
  });
});

// ─── Plugin hooks — buildStart (sharp available) ──────────────────────────────

describe('pyraImages() — buildStart() with sharp available', () => {
  beforeEach(() => resetAndMockOptimizer({
    available: true,
    metadata: { width: 1000, height: 750, format: 'jpeg' },
    buffer: Buffer.from('x'.repeat(1234)),
  }));

  async function setupPlugin(config: Record<string, unknown> = {}) {
    const { pyraImages } = await import('../plugins/image-plugin.js');
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
    // No files in public/
    await expect(plugin.buildStart?.()).resolves.not.toThrow();
    const manifest: RouteManifest = { routes: {} };
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    expect(manifest.images).toBeUndefined();
  });

  it('skips when public dir does not exist', async () => {
    // Don't create the public dir
    const { pyraImages } = await import('../plugins/image-plugin.js');
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
    const manifest: RouteManifest = { routes: {} };
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    expect(manifest.images?.['/hero.jpg']).toBeDefined();
  });

  it('stores original dimensions in manifest entry', async () => {
    writeFakeImage('public/photo.jpg');
    const plugin = await setupPlugin();
    await plugin.buildStart?.();
    const manifest: RouteManifest = { routes: {} };
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
    const manifest: RouteManifest = { routes: {} };
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    expect(Object.keys(manifest.images ?? {})[0]).toMatch(/^\/banner\.jpg$/);
  });

  it('uses forward slashes for nested image src paths', async () => {
    writeFakeImage('public/images/nested/photo.jpg');
    const plugin = await setupPlugin();
    await plugin.buildStart?.();
    const manifest: RouteManifest = { routes: {} };
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    const key = Object.keys(manifest.images ?? {}).find(k => k.includes('nested'));
    expect(key).toBe('/images/nested/photo.jpg');
  });

  it('variant key uses format "${width}:${format}"', async () => {
    writeFakeImage('public/img.jpg');
    const plugin = await setupPlugin();
    await plugin.buildStart?.();
    const manifest: RouteManifest = { routes: {} };
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    const entry = manifest.images?.['/img.jpg'];
    // Should have keys like "640:webp", "1280:webp"
    expect(Object.keys(entry?.variants ?? {})).toEqual(
      expect.arrayContaining(['640:webp'])
    );
  });

  it('variant path starts with "_images/"', async () => {
    writeFakeImage('public/img.jpg');
    const plugin = await setupPlugin();
    await plugin.buildStart?.();
    const manifest: RouteManifest = { routes: {} };
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
    const manifest: RouteManifest = { routes: {} };
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    const entry = manifest.images?.['/hero.jpg'];
    const variant = entry?.variants['640:webp'];
    expect(variant?.path).toMatch(/hero-[a-f0-9]{8}-640w\.webp/);
  });

  it('never generates variants wider than the original image', async () => {
    // Original is 1000px wide; requesting 1280w should be skipped
    writeFakeImage('public/small.jpg');
    const { pyraImages } = await import('../plugins/image-plugin.js');
    const plugin = pyraImages({ formats: ['webp'], sizes: [640, 1280] });
    fs.mkdirSync(path.join(tmpDir, 'dist', 'client', '_images'), { recursive: true });
    await plugin.setup?.({
      addEsbuildPlugin: vi.fn(),
      getConfig: vi.fn().mockReturnValue({ root: tmpDir, build: { publicDir: 'public', outDir: 'dist' } }),
      getMode: vi.fn().mockReturnValue('production'),
    });
    await plugin.buildStart?.();
    const manifest: RouteManifest = { routes: {} };
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    const entry = manifest.images?.['/small.jpg'];
    // 640w should exist (640 < 1000), 1280w should not (1280 > 1000)
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
    const manifest: RouteManifest = { routes: {} };
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    expect(Object.keys(manifest.images ?? {})).toHaveLength(2);
  });

  it('ignores non-image files in public/', async () => {
    writeFakeImage('public/img.jpg');
    // Non-image files that should be ignored
    fs.writeFileSync(path.join(tmpDir, 'public', 'styles.css'), 'body {}');
    fs.writeFileSync(path.join(tmpDir, 'public', 'robots.txt'), 'User-agent: *');
    const plugin = await setupPlugin();
    await plugin.buildStart?.();
    const manifest: RouteManifest = { routes: {} };
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    expect(Object.keys(manifest.images ?? {})).toHaveLength(1);
    expect(manifest.images?.['/img.jpg']).toBeDefined();
  });
});

// ─── Plugin hooks — buildStart (sharp unavailable) ───────────────────────────

describe('pyraImages() — buildStart() with sharp unavailable', () => {
  beforeEach(() => resetAndMockOptimizer({ available: false }));

  it('returns without throwing when sharp is missing', async () => {
    writeFakeImage('public/hero.jpg');
    const { pyraImages } = await import('../plugins/image-plugin.js');
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
    const { pyraImages } = await import('../plugins/image-plugin.js');
    const plugin = pyraImages();
    fs.mkdirSync(path.join(tmpDir, 'dist', 'client', '_images'), { recursive: true });
    await plugin.setup?.({
      addEsbuildPlugin: vi.fn(),
      getConfig: vi.fn().mockReturnValue({ root: tmpDir, build: { publicDir: 'public', outDir: 'dist' } }),
      getMode: vi.fn().mockReturnValue('production'),
    });
    await plugin.buildStart?.();
    const manifest: RouteManifest = { routes: {} };
    plugin.buildEnd?.({ manifest, outDir: path.join(tmpDir, 'dist'), root: tmpDir });
    expect(manifest.images).toBeUndefined();
  });
});

// ─── config() hook ────────────────────────────────────────────────────────────

describe('pyraImages() — config() hook', () => {
  beforeEach(() => resetAndMockOptimizer());

  it('returns null (does not mutate config)', async () => {
    const { pyraImages } = await import('../plugins/image-plugin.js');
    const plugin = pyraImages();
    const result = plugin.config?.({ root: '/app' }, 'production');
    expect(result).toBeNull();
  });

  it('config hook is defined', async () => {
    const { pyraImages } = await import('../plugins/image-plugin.js');
    const plugin = pyraImages();
    expect(typeof plugin.config).toBe('function');
  });
});
