import path from "node:path";
import type { ManifestRouteEntry, CacheConfig } from "pyrajs-shared";

// ─── Cache-Control ────────────────────────────────────────────────────────────

/**
 * Build a Cache-Control header value from a route's CacheConfig.
 * Returns "no-cache" if no cache config is provided.
 */
export function buildCacheControlHeader(
  cache: CacheConfig | undefined,
): string {
  if (!cache) return "no-cache";

  const parts: string[] = ["public"];
  if (cache.maxAge !== undefined) parts.push(`max-age=${cache.maxAge}`);
  if (cache.sMaxAge !== undefined) parts.push(`s-maxage=${cache.sMaxAge}`);
  if (cache.staleWhileRevalidate !== undefined)
    parts.push(`stale-while-revalidate=${cache.staleWhileRevalidate}`);

  return parts.length === 1 ? "no-cache" : parts.join(", ");
}

/**
 * Determine Cache-Control header for a static asset.
 * Hashed files in /assets/ get immutable caching.
 */
export function getCacheControl(urlPath: string): string {
  if (
    urlPath.includes("/assets/") &&
    isHashedFilename(path.basename(urlPath))
  ) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache";
}

/**
 * Check if a filename matches esbuild's [name]-[hash].ext pattern.
 */
function isHashedFilename(filename: string): boolean {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  return /-[A-Za-z0-9]{6,}$/.test(base);
}

// ─── MIME types ───────────────────────────────────────────────────────────────

/**
 * Get MIME type from file extension.
 */
export function getContentType(ext: string): string {
  const types: Record<string, string> = {
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
    ".map": "application/json",
  };
  return types[ext] || "application/octet-stream";
}

// ─── Asset tags ───────────────────────────────────────────────────────────────

/**
 * Generate <link> and <script> tags for a route's manifest-declared assets.
 * Each page includes ONLY the assets it needs.
 */
export function buildAssetTags(
  entry: ManifestRouteEntry,
  base: string,
): { head: string; body: string } {
  const headParts: string[] = [];

  // CSS in <head>
  for (const css of entry.css || []) {
    headParts.push(`<link rel="stylesheet" href="${base}${css}">`);
  }

  // Preload shared chunks
  for (const chunk of entry.clientChunks || []) {
    headParts.push(`<link rel="modulepreload" href="${base}${chunk}">`);
  }

  // Preload client entry
  if (entry.clientEntry) {
    headParts.push(
      `<link rel="modulepreload" href="${base}${entry.clientEntry}">`,
    );
  }

  return {
    head: headParts.join("\n  "),
    body: "",
  };
}
