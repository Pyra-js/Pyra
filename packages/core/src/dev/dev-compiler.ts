import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Middleware } from "@pyra-js/shared";
import esbuild from "esbuild";

// ── CompilerHost ──────────────────────────────────────────────────────────────

export interface CompilerHost {
  root: string;
  pyraTmpDir: string;
  serverCompileCache: Map<string, { outPath: string; timestamp: number }>;
}

// ── compileForServer ──────────────────────────────────────────────────────────

/**
 * In-flight server compiles: maps a file path to its pending compileForServer
 * promise. Concurrent SSR requests for the same uncached route share this
 * promise instead of each spawning a duplicate esbuild process.
 */
const pendingServerCompiles = new Map<string, Promise<string>>();

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

  // If an identical compile is already in progress, join it instead of
  // spawning a duplicate esbuild process.
  const inflight = pendingServerCompiles.get(filePath);
  if (inflight) return inflight;

  const compile = (async () => {
    try {
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
        // All node_modules packages stay external — they are available at runtime
        // when the compiled file is import()-ed. Bundling them is unnecessary and
        // can break packages that rely on Node.js built-ins (e.g. @babel/core).
        packages: "external",
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
    } finally {
      pendingServerCompiles.delete(filePath);
    }
  })();

  pendingServerCompiles.set(filePath, compile);
  return compile;
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
import { Readable } from "node:stream";

/**
 * Send a Web standard Response through Node's ServerResponse.
 * Handles both buffered responses (e.g. redirects from load()) and streaming
 * responses (e.g. from renderToStream). Uses Readable.fromWeb() so chunked
 * transfer encoding is applied automatically for streaming bodies.
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
    const readable = Readable.fromWeb(
      webResponse.body as import("node:stream/web").ReadableStream<Uint8Array>,
    );
    await new Promise<void>((resolve, reject) => {
      readable.on("end", resolve);
      readable.on("error", reject);
      readable.pipe(res);
    });
  } else {
    res.end();
  }
}
