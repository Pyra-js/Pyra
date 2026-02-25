import type http from "node:http";
import type { CorsConfig } from "pyrajs-shared";

const DEFAULT_METHODS = [
  "GET",
  "HEAD",
  "PUT",
  "PATCH",
  "POST",
  "DELETE",
  "OPTIONS",
];
const DEFAULT_ALLOWED_HEADERS = ["Content-Type", "Authorization"];

/**
 * Resolve the value for the `Access-Control-Allow-Origin` response header.
 * Returns `null` when the request origin is not permitted (header should be
 * omitted so the browser blocks the response).
 */
function resolveAllowOrigin(
  origin: CorsConfig["origin"],
  requestOrigin: string | undefined,
): string | null {
  // undefined / true  →  wildcard
  if (origin === undefined || origin === true) return "*";
  if (origin === false) return null;

  if (typeof origin === "string") return origin;

  if (Array.isArray(origin)) {
    // Echo the request origin only when it is on the allow-list
    if (requestOrigin && origin.includes(requestOrigin))
      return requestOrigin;
    return null;
  }

  return "*";
}

/**
 * Build the CORS headers that should be present on every response
 * (non-preflight).
 */
export function buildCORSHeaders(
  cors: boolean | CorsConfig,
  requestOrigin: string | undefined,
): Record<string, string> {
  if (cors === false) return {};

  const cfg: CorsConfig = cors === true ? {} : cors;
  const allowOrigin = resolveAllowOrigin(cfg.origin, requestOrigin);
  if (allowOrigin === null) return {};

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
  };

  // When we're reflecting a specific origin rather than '*', the response
  // must vary so caches don't serve the wrong origin's response.
  if (allowOrigin !== "*") {
    headers["Vary"] = "Origin";
  }

  if (cfg.credentials) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  if (cfg.exposedHeaders?.length) {
    headers["Access-Control-Expose-Headers"] = cfg.exposedHeaders.join(", ");
  }

  return headers;
}

/**
 * Build the full set of CORS headers for an OPTIONS preflight response.
 * This is a superset of `buildCORSHeaders` — it includes the method/header
 * allow-lists and the max-age cache hint.
 */
export function buildPreflightHeaders(
  cors: boolean | CorsConfig,
  requestOrigin: string | undefined,
): Record<string, string> {
  if (cors === false) return {};

  const base = buildCORSHeaders(cors, requestOrigin);
  if (Object.keys(base).length === 0) return {};

  const cfg: CorsConfig = cors === true ? {} : cors;

  return {
    ...base,
    "Access-Control-Allow-Methods": (
      cfg.methods ?? DEFAULT_METHODS
    ).join(", "),
    "Access-Control-Allow-Headers": (
      cfg.allowedHeaders ?? DEFAULT_ALLOWED_HEADERS
    ).join(", "),
    "Access-Control-Max-Age": String(cfg.maxAge ?? 86400),
  };
}

/**
 * Apply CORS to a Node `ServerResponse`.
 *
 * For regular requests the appropriate `Access-Control-*` headers are added
 * via `res.setHeader()` so they propagate through every downstream code path
 * that calls `writeHead()` or `res.end()`.
 *
 * For OPTIONS preflight requests the response is completed immediately
 * (204 No Content) and the function returns `true` so the caller can bail
 * out of further processing.
 *
 * @param cors  The `server.cors` config value.  When `undefined` the dev
 *              server defaults to `true` (allow all) — pass `false` explicitly
 *              to disable CORS entirely.
 * @returns `true` if the request was an OPTIONS preflight that has been
 *          handled; the caller should return without further processing.
 */
export function applyCORS(
  cors: boolean | CorsConfig | undefined,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): boolean {
  // Dev server defaults to enabled; pass cors: false to opt-out.
  const effective: boolean | CorsConfig = cors ?? true;
  if (effective === false) return false;

  const requestOrigin = req.headers.origin as string | undefined;

  if (req.method === "OPTIONS") {
    const headers = buildPreflightHeaders(effective, requestOrigin);
    for (const [k, v] of Object.entries(headers)) {
      res.setHeader(k, v);
    }
    res.writeHead(204);
    res.end();
    return true; // preflight handled — caller should stop processing
  }

  // Regular request — set headers now; Node merges setHeader() values into
  // whatever writeHead() call happens later.
  const headers = buildCORSHeaders(effective, requestOrigin);
  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v);
  }
  return false;
}
