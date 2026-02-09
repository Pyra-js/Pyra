import type http from "node:http";
import type {
  PyraMode,
  RequestContext,
  CookieJar,
  CookieOptions,
} from "pyrajs-shared";

/**
 * Internal CookieJar implementation.
 * Parses the Cookie header on construction and tracks Set-Cookie mutations.
 */
class CookieJarImpl implements CookieJar {
  private parsed: Map<string, string>;
  private pending: string[] = [];

  constructor(cookieHeader: string | undefined) {
    this.parsed = parseCookieHeader(cookieHeader || "");
  }

  get(name: string): string | undefined {
    return this.parsed.get(name);
  }

  getAll(): Record<string, string> {
    return Object.fromEntries(this.parsed);
  }

  set(name: string, value: string, options?: CookieOptions): void {
    this.parsed.set(name, value);
    this.pending.push(serializeSetCookie(name, value, options));
  }

  delete(name: string): void {
    this.parsed.delete(name);
    this.set(name, "", { maxAge: 0 });
  }

  /** Returns pending Set-Cookie header values for core to apply to the response. */
  getSetCookieHeaders(): string[] {
    return this.pending;
  }
}

/**
 * Parse a Cookie header string into a Map of name → value.
 * Format: "name1=value1; name2=value2"
 */
function parseCookieHeader(header: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;

  for (const pair of header.split(";")) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) continue;
    const name = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    if (name) {
      map.set(name, decodeURIComponent(value));
    }
  }
  return map;
}

/**
 * Serialize a Set-Cookie header value from name, value, and options.
 */
function serializeSetCookie(
  name: string,
  value: string,
  options?: CookieOptions,
): string {
  let cookie = `${name}=${encodeURIComponent(value)}`;

  if (options) {
    if (options.maxAge !== undefined) cookie += `; Max-Age=${options.maxAge}`;
    if (options.expires) cookie += `; Expires=${options.expires.toUTCString()}`;
    if (options.path) cookie += `; Path=${options.path}`;
    if (options.domain) cookie += `; Domain=${options.domain}`;
    if (options.secure) cookie += "; Secure";
    if (options.httpOnly) cookie += "; HttpOnly";
    if (options.sameSite) {
      cookie += `; SameSite=${options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1)}`;
    }
  }

  return cookie;
}

/**
 * Filter environment variables by prefix and strip the prefix from keys.
 */
function filterEnv(prefix: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(prefix) && value !== undefined) {
      result[key.slice(prefix.length)] = value;
    }
  }
  return result;
}

/**
 * Escape a string for safe embedding inside a <script> tag.
 * Prevents XSS via </script> injection and HTML comment sequences.
 */
export function escapeJsonForScript(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export interface CreateRequestContextOptions {
  req: http.IncomingMessage;
  params: Record<string, string>;
  routeId: string;
  mode: PyraMode;
  envPrefix?: string;
}

/**
 * Build a RequestContext from Node's IncomingMessage.
 *
 * Constructs a Web standard Request object and enriches it with
 * Pyra's routing data (params, cookies, env, response helpers).
 */
export function createRequestContext(
  opts: CreateRequestContextOptions,
): RequestContext {
  const { req, params, routeId, mode, envPrefix = "PYRA_" } = opts;

  // Build the full URL from the request
  const protocol = "http";
  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `${protocol}://${host}`);

  // Convert Node headers to a Web Headers object
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  // Build Web standard Request
  const request = new Request(url.href, {
    method: req.method || "GET",
    headers,
  });

  // Build CookieJar from Cookie header
  const cookies = new CookieJarImpl(req.headers.cookie);

  // Filter env vars by prefix
  const env = filterEnv(envPrefix);

  const ctx: RequestContext = {
    request,
    url,
    params,
    headers,
    cookies,
    env,
    mode,
    routeId,

    json(data: unknown, init?: ResponseInit): Response {
      const body = JSON.stringify(data);
      return new Response(body, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
    },

    html(body: string, init?: ResponseInit): Response {
      return new Response(body, {
        ...init,
        headers: {
          "Content-Type": "text/html",
          ...init?.headers,
        },
      });
    },

    redirect(redirectUrl: string, status = 302): Response {
      return new Response(null, {
        status,
        headers: { Location: redirectUrl },
      });
    },

    text(body: string, init?: ResponseInit): Response {
      return new Response(body, {
        ...init,
        headers: {
          "Content-Type": "text/plain",
          ...init?.headers,
        },
      });
    },
  };

  return ctx;
}

/**
 * Extract pending Set-Cookie headers from a RequestContext.
 * Returns empty array if the cookies aren't our CookieJarImpl.
 */
export function getSetCookieHeaders(ctx: RequestContext): string[] {
  if (ctx.cookies instanceof CookieJarImpl) {
    return ctx.cookies.getSetCookieHeaders();
  }
  return [];
}
