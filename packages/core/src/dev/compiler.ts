import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Middleware } from "pyrajs-shared";
import esbuild from "esbuild";

// ── CompilerHost ──────────────────────────────────────────────────────────────

export interface CompilerHost {
  root: string;
  pyraTmpDir: string;
  serverCompileCache: Map<string, { outPath: string; timestamp: number }>;
}

// ── compileForServer ──────────────────────────────────────────────────────────

/**
 * Compile a route/middleware/layout module for server-side execution.
 *
 * Uses esbuild with:
 * - platform: 'node' (so it can be import()-ed at runtime)
 * - format: 'esm'
 * - jsx: 'automatic' with react import source
 * - external: react, react-dom (resolved from node_modules at import time)
 *
 * Writes output to .pyra/server/ temp directory. Uses a simple timestamp
 * cache — recompiles only when the source file is newer than the output.
 */
export async function compileForServer(
  host: CompilerHost,
  filePath: string,
): Promise<string> {
  // Determine output path: .pyra/server/<relative-path>.mjs
  const relativePath = path.relative(host.root, filePath);
  const outFileName =
    relativePath
      .split(path.sep)
      .join("_")
      .replace(/\.[^.]+$/, "") + ".mjs";
  const outPath = path.join(host.pyraTmpDir, outFileName);

  // Check cache: skip recompile if output is newer than source
  const cached = host.serverCompileCache.get(filePath);
  if (cached && fs.existsSync(cached.outPath)) {
    try {
      const srcStat = fs.statSync(filePath);
      if (srcStat.mtimeMs <= cached.timestamp) {
        return cached.outPath;
      }
    } catch {
      // File may have been deleted — recompile
    }
  }

  // Ensure output directory exists
  fs.mkdirSync(host.pyraTmpDir, { recursive: true });

  // Compile with esbuild
  await esbuild.build({
    entryPoints: [filePath],
    outfile: outPath,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2020",
    jsx: "automatic",
    jsxImportSource: "react",
    // React stays external — resolved from node_modules when we import()
    external: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
    sourcemap: "inline",
    logLevel: "silent",
    absWorkingDir: host.root,
  });

  // Update cache
  host.serverCompileCache.set(filePath, {
    outPath,
    timestamp: Date.now(),
  });

  return outPath;
}

// ── loadMiddlewareChain ───────────────────────────────────────────────────────

/**
 * Compile and import middleware files, returning an array of Middleware
 * functions. Accepts both `export default` and `export { middleware }`.
 */
export async function loadMiddlewareChain(
  host: CompilerHost,
  middlewarePaths: string[],
): Promise<Middleware[]> {
  const chain: Middleware[] = [];
  for (const filePath of middlewarePaths) {
    const compiled = await compileForServer(host, filePath);
    const moduleUrl = pathToFileURL(compiled).href + `?t=${Date.now()}`;
    const mod = await import(moduleUrl);
    const fn =
      typeof mod.default === "function"
        ? mod.default
        : typeof mod.middleware === "function"
          ? mod.middleware
          : null;
    if (fn) {
      chain.push(fn);
    }
  }
  return chain;
}

// ── sendWebResponse ───────────────────────────────────────────────────────────

import http from "node:http";

/**
 * Send a Web standard Response through Node's ServerResponse.
 * Used when load() returns a Response (e.g. redirect) or when a route
 * handler returns one directly.
 */
export async function sendWebResponse(
  res: http.ServerResponse,
  webResponse: Response,
): Promise<void> {
  res.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  if (webResponse.body) {
    const body = await webResponse.text();
    res.end(body);
  } else {
    res.end();
  }
}
