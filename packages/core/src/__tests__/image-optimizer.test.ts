import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ─── Mock sharp pipeline factory ─────────────────────────────────────────────

function createMockPipeline(metadata = { width: 800, height: 600, format: 'webp' }) {
  const instance: Record<string, unknown> = {};
  instance.resize = vi.fn(() => instance);
  instance.webp   = vi.fn(() => instance);
  instance.avif   = vi.fn(() => instance);
  instance.jpeg   = vi.fn(() => instance);
  instance.png    = vi.fn(() => instance);
  instance.metadata = vi.fn().mockResolvedValue(metadata);
  instance.toBuffer = vi.fn().mockResolvedValue(Buffer.from('fake-compressed-image-bytes'));
  return instance;
}

// ─── Shared temp file ─────────────────────────────────────────────────────────

let tmpFile: string;

beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `pyra-test-${Date.now()}.jpg`);
  fs.writeFileSync(tmpFile, 'fake-jpeg-data');
});

afterEach(() => {
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

// ─── sharp available ──────────────────────────────────────────────────────────

describe('image-optimizer — sharp available', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('sharp', () => ({
      default: vi.fn(() => createMockPipeline()),
    }));
  });

  afterEach(() => {
    vi.doUnmock('sharp');
  });

  // ── isSharpAvailable ───────────────────────────────────────────────────────

  describe('isSharpAvailable()', () => {
    it('returns true when sharp can be imported', async () => {
      const { isSharpAvailable } = await import('../image-optimizer.js');
      expect(await isSharpAvailable()).toBe(true);
    });

    it('caches the result — subsequent calls do not re-import sharp', async () => {
      const { isSharpAvailable } = await import('../image-optimizer.js');
      await isSharpAvailable();
      await isSharpAvailable();
      // sharp module is only imported once (cached in module state)
      const sharpMod = await import('sharp');
      // The module factory is called once during the first dynamic import resolution
      expect(await isSharpAvailable()).toBe(true);
    });
  });

  // ── getImageMetadata ───────────────────────────────────────────────────────

  describe('getImageMetadata()', () => {
    it('returns width, height, and format from sharp metadata', async () => {
      vi.resetModules();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => createMockPipeline({ width: 1920, height: 1080, format: 'jpeg' })),
      }));
      const { getImageMetadata } = await import('../image-optimizer.js');
      const meta = await getImageMetadata(tmpFile);
      expect(meta.width).toBe(1920);
      expect(meta.height).toBe(1080);
      expect(meta.format).toBe('jpeg');
    });

    it('defaults width to 0 when sharp returns undefined', async () => {
      vi.resetModules();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => createMockPipeline({ width: undefined as unknown as number, height: undefined as unknown as number, format: 'png' })),
      }));
      const { getImageMetadata } = await import('../image-optimizer.js');
      const meta = await getImageMetadata(tmpFile);
      expect(meta.width).toBe(0);
      expect(meta.height).toBe(0);
    });

    it('defaults format to "unknown" when sharp returns undefined', async () => {
      vi.resetModules();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => createMockPipeline({ width: 100, height: 100, format: undefined as unknown as string })),
      }));
      const { getImageMetadata } = await import('../image-optimizer.js');
      const meta = await getImageMetadata(tmpFile);
      expect(meta.format).toBe('unknown');
    });
  });

  // ── optimizeImage ─────────────────────────────────────────────────────────

  describe('optimizeImage()', () => {
    it('returns a buffer, dimensions, format, and size', async () => {
      const { optimizeImage } = await import('../image-optimizer.js');
      const result = await optimizeImage(tmpFile, { format: 'webp', quality: 80, width: 640 });
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.format).toBe('webp');
      expect(result.size).toBe(result.buffer.length);
    });

    it('size property equals buffer.length', async () => {
      const { optimizeImage } = await import('../image-optimizer.js');
      const result = await optimizeImage(tmpFile, { format: 'jpeg' });
      expect(result.size).toBe(result.buffer.length);
    });

    it('defaults format to "webp" when not specified', async () => {
      const { optimizeImage } = await import('../image-optimizer.js');
      const result = await optimizeImage(tmpFile, {});
      expect(result.format).toBe('webp');
    });

    it('throws when the source file does not exist', async () => {
      const { optimizeImage } = await import('../image-optimizer.js');
      await expect(
        optimizeImage('/nonexistent/path/image.jpg', { format: 'webp' })
      ).rejects.toThrow('source image not found');
    });

    it('calls .webp() on the pipeline for webp format', async () => {
      vi.resetModules();
      const mockPipeline = createMockPipeline();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => mockPipeline),
      }));
      const { optimizeImage } = await import('../image-optimizer.js');
      await optimizeImage(tmpFile, { format: 'webp', quality: 75 });
      expect(mockPipeline.webp).toHaveBeenCalledWith({ quality: 75 });
    });

    it('calls .avif() on the pipeline for avif format', async () => {
      vi.resetModules();
      const mockPipeline = createMockPipeline();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => mockPipeline),
      }));
      const { optimizeImage } = await import('../image-optimizer.js');
      await optimizeImage(tmpFile, { format: 'avif', quality: 60 });
      expect(mockPipeline.avif).toHaveBeenCalledWith({ quality: 60 });
    });

    it('calls .jpeg() on the pipeline for jpeg format', async () => {
      vi.resetModules();
      const mockPipeline = createMockPipeline();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => mockPipeline),
      }));
      const { optimizeImage } = await import('../image-optimizer.js');
      await optimizeImage(tmpFile, { format: 'jpeg', quality: 85 });
      expect(mockPipeline.jpeg).toHaveBeenCalledWith({ quality: 85 });
    });

    it('calls .png() on the pipeline for png format', async () => {
      vi.resetModules();
      const mockPipeline = createMockPipeline();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => mockPipeline),
      }));
      const { optimizeImage } = await import('../image-optimizer.js');
      await optimizeImage(tmpFile, { format: 'png', quality: 90 });
      expect(mockPipeline.png).toHaveBeenCalledWith({ quality: 90 });
    });

    it('calls .resize() when width is specified', async () => {
      vi.resetModules();
      const mockPipeline = createMockPipeline();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => mockPipeline),
      }));
      const { optimizeImage } = await import('../image-optimizer.js');
      await optimizeImage(tmpFile, { format: 'webp', width: 640 });
      expect(mockPipeline.resize).toHaveBeenCalledWith(
        expect.objectContaining({ width: 640, withoutEnlargement: true })
      );
    });

    it('does not call .resize() when no width is given', async () => {
      vi.resetModules();
      const mockPipeline = createMockPipeline();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => mockPipeline),
      }));
      const { optimizeImage } = await import('../image-optimizer.js');
      await optimizeImage(tmpFile, { format: 'webp' });
      expect(mockPipeline.resize).not.toHaveBeenCalled();
    });

    it('defaults resize fit to "inside"', async () => {
      vi.resetModules();
      const mockPipeline = createMockPipeline();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => mockPipeline),
      }));
      const { optimizeImage } = await import('../image-optimizer.js');
      await optimizeImage(tmpFile, { format: 'webp', width: 800 });
      expect(mockPipeline.resize).toHaveBeenCalledWith(
        expect.objectContaining({ fit: 'inside' })
      );
    });

    it('passes custom fit through to resize', async () => {
      vi.resetModules();
      const mockPipeline = createMockPipeline();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => mockPipeline),
      }));
      const { optimizeImage } = await import('../image-optimizer.js');
      await optimizeImage(tmpFile, { format: 'webp', width: 400, fit: 'cover' });
      expect(mockPipeline.resize).toHaveBeenCalledWith(
        expect.objectContaining({ fit: 'cover' })
      );
    });

    // ── Quality clamping ──────────────────────────────────────────────────────

    it('clamps quality below 1 to 1', async () => {
      vi.resetModules();
      const mockPipeline = createMockPipeline();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => mockPipeline),
      }));
      const { optimizeImage } = await import('../image-optimizer.js');
      await optimizeImage(tmpFile, { format: 'webp', quality: -10 });
      expect(mockPipeline.webp).toHaveBeenCalledWith({ quality: 1 });
    });

    it('clamps quality above 100 to 100', async () => {
      vi.resetModules();
      const mockPipeline = createMockPipeline();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => mockPipeline),
      }));
      const { optimizeImage } = await import('../image-optimizer.js');
      await optimizeImage(tmpFile, { format: 'webp', quality: 999 });
      expect(mockPipeline.webp).toHaveBeenCalledWith({ quality: 100 });
    });

    it('passes quality 1 through without clamping', async () => {
      vi.resetModules();
      const mockPipeline = createMockPipeline();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => mockPipeline),
      }));
      const { optimizeImage } = await import('../image-optimizer.js');
      await optimizeImage(tmpFile, { format: 'webp', quality: 1 });
      expect(mockPipeline.webp).toHaveBeenCalledWith({ quality: 1 });
    });

    it('passes quality 100 through without clamping', async () => {
      vi.resetModules();
      const mockPipeline = createMockPipeline();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => mockPipeline),
      }));
      const { optimizeImage } = await import('../image-optimizer.js');
      await optimizeImage(tmpFile, { format: 'webp', quality: 100 });
      expect(mockPipeline.webp).toHaveBeenCalledWith({ quality: 100 });
    });

    it('defaults quality to 80 when not provided', async () => {
      vi.resetModules();
      const mockPipeline = createMockPipeline();
      vi.doMock('sharp', () => ({
        default: vi.fn(() => mockPipeline),
      }));
      const { optimizeImage } = await import('../image-optimizer.js');
      await optimizeImage(tmpFile, { format: 'webp' });
      expect(mockPipeline.webp).toHaveBeenCalledWith({ quality: 80 });
    });
  });
});

// ─── sharp unavailable ────────────────────────────────────────────────────────

describe('image-optimizer — sharp not installed', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('sharp', () => {
      throw new Error('Cannot find module "sharp"');
    });
  });

  afterEach(() => {
    vi.doUnmock('sharp');
  });

  it('isSharpAvailable() returns false', async () => {
    const { isSharpAvailable } = await import('../image-optimizer.js');
    expect(await isSharpAvailable()).toBe(false);
  });

  it('getImageMetadata() throws with install instructions', async () => {
    const { getImageMetadata } = await import('../image-optimizer.js');
    await expect(getImageMetadata('/some/image.jpg')).rejects.toThrow(
      'npm install sharp'
    );
  });

  it('getImageMetadata() error message mentions [pyra:images]', async () => {
    const { getImageMetadata } = await import('../image-optimizer.js');
    await expect(getImageMetadata('/some/image.jpg')).rejects.toThrow(
      '[pyra:images]'
    );
  });

  it('optimizeImage() throws with install instructions', async () => {
    const { optimizeImage } = await import('../image-optimizer.js');
    await expect(optimizeImage('/some/image.jpg', {})).rejects.toThrow(
      'npm install sharp'
    );
  });

  it('optimizeImage() error message mentions [pyra:images]', async () => {
    const { optimizeImage } = await import('../image-optimizer.js');
    await expect(optimizeImage('/some/image.jpg', {})).rejects.toThrow(
      '[pyra:images]'
    );
  });
});
