import { describe, it, expect } from 'vitest';
import { isCompressible, negotiateEncoding, compressBuffer } from '../prod/prod-compress.js';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import http from 'node:http';

// ─── isCompressible ──────────────────────────────────────────────────────────

describe('isCompressible', () => {
  const compressible = [
    'text/html',
    'text/css',
    'text/plain',
    'text/javascript',
    'application/javascript',
    'application/json',
    'application/xml',
    'application/xhtml+xml',
    'image/svg+xml',
  ];

  for (const type of compressible) {
    it(`returns true for ${type}`, () => {
      expect(isCompressible(type)).toBe(true);
    });
  }

  const notCompressible = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/avif',
    'image/gif',
    'font/woff2',
    'font/woff',
    'application/octet-stream',
    'video/mp4',
  ];

  for (const type of notCompressible) {
    it(`returns false for ${type}`, () => {
      expect(isCompressible(type)).toBe(false);
    });
  }

  it('strips charset parameters before checking', () => {
    expect(isCompressible('text/html; charset=utf-8')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isCompressible('TEXT/HTML')).toBe(true);
    expect(isCompressible('Application/JSON')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isCompressible('')).toBe(false);
  });
});

// ─── negotiateEncoding ───────────────────────────────────────────────────────

function makeReq(acceptEncoding?: string): http.IncomingMessage {
  const req = new http.IncomingMessage(null as any);
  (req as any).headers = acceptEncoding
    ? { 'accept-encoding': acceptEncoding }
    : {};
  return req;
}

describe('negotiateEncoding', () => {
  it('returns "br" when brotli is offered', () => {
    expect(negotiateEncoding(makeReq('br, gzip, deflate'))).toBe('br');
  });

  it('prefers brotli over gzip when both are offered', () => {
    expect(negotiateEncoding(makeReq('gzip, br'))).toBe('br');
  });

  it('returns "gzip" when only gzip is offered', () => {
    expect(negotiateEncoding(makeReq('gzip, deflate'))).toBe('gzip');
  });

  it('returns null when no supported encoding is offered', () => {
    expect(negotiateEncoding(makeReq('deflate, identity'))).toBeNull();
  });

  it('returns null when Accept-Encoding header is absent', () => {
    expect(negotiateEncoding(makeReq())).toBeNull();
  });

  it('returns null for an empty Accept-Encoding header', () => {
    expect(negotiateEncoding(makeReq(''))).toBeNull();
  });
});

// ─── compressBuffer ──────────────────────────────────────────────────────────

function makeLargeBuffer(): Buffer {
  // Highly compressible 4 KB buffer (repeated pattern)
  return Buffer.from('a'.repeat(4096));
}

describe('compressBuffer — gzip', () => {
  it('compresses a buffer larger than the minimum size threshold', () => {
    const input = makeLargeBuffer();
    const result = compressBuffer(input, 'gzip');
    expect(result.encoding).toBe('gzip');
    expect(result.data).toBeInstanceOf(Buffer);
  });

  it('produces output that decompresses back to the original', () => {
    const input = makeLargeBuffer();
    const result = compressBuffer(input, 'gzip');
    expect(result.encoding).toBe('gzip');
    const decompressed = gunzipSync(result.data);
    expect(decompressed.equals(input)).toBe(true);
  });

  it('returns encoding: null for a buffer below the minimum size', () => {
    const small = Buffer.from('hello');
    const result = compressBuffer(small, 'gzip');
    expect(result.encoding).toBeNull();
    expect(result.data).toBe(small);
  });
});

describe('compressBuffer — brotli', () => {
  it('compresses a buffer larger than the minimum size threshold', () => {
    const input = makeLargeBuffer();
    const result = compressBuffer(input, 'br');
    expect(result.encoding).toBe('br');
    expect(result.data).toBeInstanceOf(Buffer);
  });

  it('produces output that decompresses back to the original', () => {
    const input = makeLargeBuffer();
    const result = compressBuffer(input, 'br');
    expect(result.encoding).toBe('br');
    const decompressed = brotliDecompressSync(result.data);
    expect(decompressed.equals(input)).toBe(true);
  });

  it('returns encoding: null for a buffer below the minimum size', () => {
    const small = Buffer.from('tiny');
    const result = compressBuffer(small, 'br');
    expect(result.encoding).toBeNull();
  });
});
