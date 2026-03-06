import http from "node:http";
import {
  createGzip,
  createBrotliCompress,
  gzipSync,
  brotliCompressSync,
} from "node:zlib";
import type { Transform } from "node:stream";

// ── Compressible MIME types ───────────────────────────────────────────────────

const COMPRESSIBLE = new Set([
  "text/html",
  "text/css",
  "text/plain",
  "text/javascript",
  "application/javascript",
  "application/json",
  "application/xml",
  "application/xhtml+xml",
  "image/svg+xml",
]);

/** Minimum response body size to bother compressing (bytes). */
const MIN_SIZE = 1024;

/**
 * Returns true when the Content-Type is worth compressing.
 * Already-compressed formats (images, woff2, etc.) return false.
 */
export function isCompressible(contentType: string): boolean {
  const base = contentType.split(";")[0].trim().toLowerCase();
  return COMPRESSIBLE.has(base);
}

// ── Encoding negotiation ──────────────────────────────────────────────────────

/**
 * Pick the best supported encoding from the request's Accept-Encoding header.
 * Prefers brotli over gzip when both are offered (brotli is ~15–25% smaller).
 * Returns null when the client does not accept either.
 */
export function negotiateEncoding(
  req: http.IncomingMessage,
): "br" | "gzip" | null {
  const accept = String(req.headers["accept-encoding"] ?? "");
  if (accept.includes("br")) return "br";
  if (accept.includes("gzip")) return "gzip";
  return null;
}

// ── Transform stream ──────────────────────────────────────────────────────────

/** Create a gzip or brotli Transform stream for streaming compression. */
export function createCompressStream(encoding: "br" | "gzip"): Transform {
  return encoding === "br" ? createBrotliCompress() : createGzip();
}

// ── Synchronous compression (for in-memory buffers) ──────────────────────────

/**
 * Synchronously compress a Buffer when it meets the minimum size threshold.
 * Returns the compressed buffer and the applied encoding, or the original
 * buffer and null when compression is skipped.
 */
export function compressBuffer(
  data: Buffer,
  encoding: "br" | "gzip",
): { data: Buffer; encoding: "br" | "gzip" } | { data: Buffer; encoding: null } {
  if (data.length < MIN_SIZE) return { data, encoding: null };
  const compressed =
    encoding === "br" ? brotliCompressSync(data) : gzipSync(data);
  return { data: compressed, encoding };
}
