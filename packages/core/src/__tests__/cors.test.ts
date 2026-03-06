import { describe, it, expect, vi } from 'vitest';
import { buildCORSHeaders, buildPreflightHeaders, applyCORS } from '../cors.js';
import http from 'node:http';

// ─── buildCORSHeaders ────────────────────────────────────────────────────────

describe('buildCORSHeaders — cors: false', () => {
  it('returns an empty object', () => {
    expect(buildCORSHeaders(false, 'https://example.com')).toEqual({});
  });
});

describe('buildCORSHeaders — cors: true (wildcard)', () => {
  it('returns Access-Control-Allow-Origin: *', () => {
    const h = buildCORSHeaders(true, 'https://example.com');
    expect(h['Access-Control-Allow-Origin']).toBe('*');
  });

  it('does not add a Vary header for wildcard', () => {
    const h = buildCORSHeaders(true, 'https://example.com');
    expect(h['Vary']).toBeUndefined();
  });

  it('works when requestOrigin is undefined', () => {
    const h = buildCORSHeaders(true, undefined);
    expect(h['Access-Control-Allow-Origin']).toBe('*');
  });
});

describe('buildCORSHeaders — specific string origin', () => {
  it('echoes the configured origin string regardless of request origin', () => {
    const h = buildCORSHeaders(
      { origin: 'https://app.example.com' },
      'https://other.com',
    );
    expect(h['Access-Control-Allow-Origin']).toBe('https://app.example.com');
  });

  it('adds Vary: Origin for a non-wildcard origin', () => {
    const h = buildCORSHeaders({ origin: 'https://app.example.com' }, 'https://app.example.com');
    expect(h['Vary']).toBe('Origin');
  });
});

describe('buildCORSHeaders — array of allowed origins', () => {
  const config = { origin: ['https://a.com', 'https://b.com'] };

  it('echoes the request origin when it is on the allow-list', () => {
    const h = buildCORSHeaders(config, 'https://a.com');
    expect(h['Access-Control-Allow-Origin']).toBe('https://a.com');
  });

  it('returns empty when the request origin is not on the allow-list', () => {
    const h = buildCORSHeaders(config, 'https://evil.com');
    expect(h['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('returns empty when requestOrigin is undefined', () => {
    const h = buildCORSHeaders(config, undefined);
    expect(h['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('adds Vary: Origin when echoing a specific origin', () => {
    const h = buildCORSHeaders(config, 'https://b.com');
    expect(h['Vary']).toBe('Origin');
  });
});

describe('buildCORSHeaders — credentials', () => {
  it('adds Access-Control-Allow-Credentials: true when credentials is set', () => {
    const h = buildCORSHeaders(
      { origin: 'https://app.com', credentials: true },
      'https://app.com',
    );
    expect(h['Access-Control-Allow-Credentials']).toBe('true');
  });

  it('omits credentials header when not configured', () => {
    const h = buildCORSHeaders(true, 'https://example.com');
    expect(h['Access-Control-Allow-Credentials']).toBeUndefined();
  });
});

describe('buildCORSHeaders — exposedHeaders', () => {
  it('sets Access-Control-Expose-Headers when configured', () => {
    const h = buildCORSHeaders(
      { exposedHeaders: ['X-Request-Id', 'X-Custom'] },
      undefined,
    );
    expect(h['Access-Control-Expose-Headers']).toBe('X-Request-Id, X-Custom');
  });

  it('omits expose header when list is empty', () => {
    const h = buildCORSHeaders({ exposedHeaders: [] }, undefined);
    expect(h['Access-Control-Expose-Headers']).toBeUndefined();
  });
});

// ─── buildPreflightHeaders ───────────────────────────────────────────────────

describe('buildPreflightHeaders', () => {
  it('returns empty when cors is false', () => {
    expect(buildPreflightHeaders(false, 'https://example.com')).toEqual({});
  });

  it('includes all base CORS headers', () => {
    const h = buildPreflightHeaders(true, 'https://example.com');
    expect(h['Access-Control-Allow-Origin']).toBe('*');
  });

  it('includes default methods', () => {
    const h = buildPreflightHeaders(true, undefined);
    const methods = h['Access-Control-Allow-Methods'];
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('DELETE');
  });

  it('uses custom methods when provided', () => {
    const h = buildPreflightHeaders({ methods: ['GET', 'POST'] }, undefined);
    expect(h['Access-Control-Allow-Methods']).toBe('GET, POST');
  });

  it('includes default allowed headers', () => {
    const h = buildPreflightHeaders(true, undefined);
    const allowed = h['Access-Control-Allow-Headers'];
    expect(allowed).toContain('Content-Type');
    expect(allowed).toContain('Authorization');
  });

  it('uses custom allowed headers when provided', () => {
    const h = buildPreflightHeaders(
      { allowedHeaders: ['X-API-Key'] },
      undefined,
    );
    expect(h['Access-Control-Allow-Headers']).toBe('X-API-Key');
  });

  it('defaults max-age to 86400', () => {
    const h = buildPreflightHeaders(true, undefined);
    expect(h['Access-Control-Max-Age']).toBe('86400');
  });

  it('uses custom max-age when provided', () => {
    const h = buildPreflightHeaders({ maxAge: 3600 }, undefined);
    expect(h['Access-Control-Max-Age']).toBe('3600');
  });

  it('returns empty when origin is not allowed (allow-list miss)', () => {
    const h = buildPreflightHeaders(
      { origin: ['https://allowed.com'] },
      'https://blocked.com',
    );
    expect(Object.keys(h)).toHaveLength(0);
  });
});

// ─── applyCORS ───────────────────────────────────────────────────────────────

function makeReq(method: string, origin?: string): http.IncomingMessage {
  const req = new http.IncomingMessage(null as any);
  req.method = method;
  req.url = '/';
  (req as any).headers = origin ? { origin } : {};
  return req;
}

function makeRes() {
  const headers: Record<string, string> = {};
  let statusCode = 0;
  let ended = false;

  return {
    setHeader: vi.fn((k: string, v: string) => { headers[k] = v; }),
    writeHead: vi.fn((code: number) => { statusCode = code; }),
    end: vi.fn(() => { ended = true; }),
    get headers() { return headers; },
    get statusCode() { return statusCode; },
    get ended() { return ended; },
  } as any;
}

describe('applyCORS — OPTIONS preflight', () => {
  it('returns true and ends the response with 204', () => {
    const req = makeReq('OPTIONS', 'https://example.com');
    const res = makeRes();
    const handled = applyCORS(true, req, res);
    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('sets CORS headers on the preflight response', () => {
    const req = makeReq('OPTIONS', 'https://example.com');
    const res = makeRes();
    applyCORS(true, req, res);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.headers['Access-Control-Allow-Methods']).toBeDefined();
  });
});

describe('applyCORS — regular requests', () => {
  it('returns false for non-OPTIONS requests', () => {
    const req = makeReq('GET', 'https://example.com');
    const res = makeRes();
    expect(applyCORS(true, req, res)).toBe(false);
  });

  it('sets CORS headers via setHeader()', () => {
    const req = makeReq('GET', 'https://example.com');
    const res = makeRes();
    applyCORS(true, req, res);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('does not end the response for non-OPTIONS requests', () => {
    const req = makeReq('GET');
    const res = makeRes();
    applyCORS(true, req, res);
    expect(res.end).not.toHaveBeenCalled();
  });
});

describe('applyCORS — cors: false', () => {
  it('returns false and sets no headers', () => {
    const req = makeReq('GET', 'https://example.com');
    const res = makeRes();
    const result = applyCORS(false, req, res);
    expect(result).toBe(false);
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});

describe('applyCORS — cors: undefined defaults to enabled', () => {
  it('sets Access-Control-Allow-Origin when cors config is undefined', () => {
    const req = makeReq('GET', 'https://example.com');
    const res = makeRes();
    applyCORS(undefined, req, res);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
