/**
 * Dev-server proxy middleware.
 *
 * Forwards requests to an upstream target when the request path matches a rule
 * defined in `server.proxy` of the Pyra config.
 *
 * Config shape:
 *   proxy: {
 *     '/api': 'http://localhost:4000',
 *     '/rpc': {
 *       target: 'http://localhost:5000',
 *       changeOrigin: true,
 *       rewrite: (path) => path.replace(/^\/rpc/, ''),
 *     },
 *   }
 */

import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { log } from "pyrajs-shared";

type ProxyTarget =
  | string
  | {
      target: string;
      changeOrigin?: boolean;
      rewrite?: (path: string) => string;
    };

interface ResolvedRule {
  target: string;
  changeOrigin: boolean;
  rewrite?: (path: string) => string;
}

/**
 * Check whether `url` matches any proxy rule. Returns the resolved rule or
 * null if no prefix matched.
 */
export function matchProxyRule(
  url: string,
  proxy: Record<string, ProxyTarget>,
): ResolvedRule | null {
  for (const [prefix, rule] of Object.entries(proxy)) {
    if (!url.startsWith(prefix)) continue;

    if (typeof rule === "string") {
      return { target: rule, changeOrigin: false };
    }

    return {
      target: rule.target,
      changeOrigin: rule.changeOrigin ?? false,
      rewrite: rule.rewrite,
    };
  }
  return null;
}

/**
 * Forward `req` to the upstream defined by `rule` and write the response back
 * to `res`. The full original URL (including query string) is forwarded so
 * that the upstream receives search params correctly.
 */
export function handleProxyRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  originalUrl: string,
  rule: ResolvedRule,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let target: URL;
    try {
      target = new URL(rule.target);
    } catch {
      log.error(`[proxy] Invalid target URL: ${rule.target}`);
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end(`Proxy configuration error: invalid target "${rule.target}"`);
      resolve();
      return;
    }

    const isHttps = target.protocol === "https:";
    const lib = isHttps ? https : http;

    // Apply optional path rewrite; keep query string intact.
    const [pathname, qs] = originalUrl.split("?");
    const rewritten = rule.rewrite ? rule.rewrite(pathname) : pathname;
    const forwardPath = qs ? `${rewritten}?${qs}` : rewritten;

    // Build forwarded headers, optionally overriding Host for virtual-host upstreams.
    const forwardHeaders: http.OutgoingHttpHeaders = { ...req.headers };
    if (rule.changeOrigin) {
      forwardHeaders["host"] = target.host;
    }

    const options: http.RequestOptions = {
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: forwardPath,
      method: req.method ?? "GET",
      headers: forwardHeaders,
    };

    const proxyReq = lib.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
      proxyRes.on("end", resolve);
    });

    proxyReq.on("error", (err) => {
      log.error(`[proxy] ${req.method} ${originalUrl} → ${rule.target}: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end(
          `502 Bad Gateway\n\nProxy could not reach ${rule.target}\n${err.message}`,
        );
      }
      resolve();
    });

    // Pipe the request body (needed for POST/PUT/PATCH).
    req.pipe(proxyReq, { end: true });
  });
}
