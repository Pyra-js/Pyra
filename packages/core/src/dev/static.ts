import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import type { PyraConfig, ImageFormat } from "pyrajs-shared";
import { isSharpAvailable, optimizeImage } from "../image-optimizer.js";
import { bundleFile, getCSSOutput } from "../bundler.js";
import { runPostCSS } from "../css-plugin.js";

// ── StaticHost ────────────────────────────────────────────────────────────────

export interface StaticHost {
  root: string;
  config: PyraConfig | undefined;
  imageCache: Map<
    string,
    { buffer: Buffer; format: ImageFormat; expiresAt: number }
  >;
  verbose: boolean;
}

// ── handleImageRequest ────────────────────────────────────────────────────────

/**
 * On-demand image optimization endpoint (`/_pyra/image?src=&w=&format=&q=`).
 * Active in dev mode when the `pyra:images` plugin is present in config.
 * Results are cached for 60 seconds.
 */
export async function handleImageRequest(
  host: StaticHost,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  rawUrl: string,
): Promise<void> {
  const params = new URLSearchParams(rawUrl.split("?")[1] ?? "");
  const src = params.get("src") ?? "";
  const w = parseInt(params.get("w") ?? "0", 10) || undefined;
  const format = (params.get("format") ?? "webp") as ImageFormat;
  const q = parseInt(params.get("q") ?? "80", 10) || 80;

  const ALLOWED_FORMATS: ImageFormat[] = ["webp", "avif", "jpeg", "png"];
  if (!ALLOWED_FORMATS.includes(format)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unsupported format" }));
    return;
  }

  // Security: reject path traversal or absolute paths
  if (
    !src.startsWith("/") ||
    src.includes("..") ||
    path.isAbsolute(src.slice(1))
  ) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid src" }));
    return;
  }

  // Check sharp availability
  if (!(await isSharpAvailable())) {
    res.writeHead(501, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error:
          "Image optimization unavailable: sharp is not installed. Run: npm install sharp",
      }),
    );
    return;
  }

  // Resolve file path: try public/{src} first, then root/{src}
  const publicDir = host.config?.build?.publicDir ?? "public";
  const publicPath = path.join(host.root, publicDir, src);
  const rootPath = path.join(host.root, src);
  const resolvedPath = fs.existsSync(publicPath) ? publicPath : rootPath;

  if (!fs.existsSync(resolvedPath)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Image not found" }));
    return;
  }

  const cacheKey = `${resolvedPath}|${w ?? ""}|${format}|${q}`;
  const now = Date.now();
  const cached = host.imageCache.get(cacheKey);

  let buffer: Buffer;
  let outFormat: ImageFormat;

  if (cached && cached.expiresAt > now) {
    buffer = cached.buffer;
    outFormat = cached.format;
  } else {
    try {
      const result = await optimizeImage(resolvedPath, {
        width: w,
        format,
        quality: q,
      });
      buffer = result.buffer;
      outFormat = result.format;
      host.imageCache.set(cacheKey, {
        buffer,
        format: outFormat,
        expiresAt: now + 60_000, // 60 second TTL
      });
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (err as Error).message }));
      return;
    }
  }

  res.writeHead(200, {
    "Content-Type": `image/${outFormat}`,
    "Content-Length": buffer.length,
    "Cache-Control": "public, max-age=60",
  });
  res.end(buffer);
}

// ── resolvePublicFilePath ─────────────────────────────────────────────────────

/**
 * Resolve a URL path to a file inside the configured `public/` directory.
 * Returns the absolute file path if it exists as a file, null otherwise.
 */
export function resolvePublicFilePath(
  host: StaticHost,
  urlPath: string,
): string | null {
  const publicDir = host.config?.build?.publicDir ?? "public";
  const candidate = path.join(host.root, publicDir, urlPath);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }
  return null;
}

// ── servePublicFile ───────────────────────────────────────────────────────────

/**
 * Serve a file from the `public/` directory.
 * Reads as a Buffer so binary files (images, fonts, etc.) are handled correctly.
 */
export function servePublicFile(
  host: StaticHost,
  res: http.ServerResponse,
  filePath: string,
): void {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = getContentType(ext);
  const content = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": content.length,
    "Cache-Control": "public, max-age=3600",
  });
  res.end(content);
}

// ── processCSS ────────────────────────────────────────────────────────────────

/**
 * Run a CSS file's content through PostCSS if a postcss.config.* exists in
 * the project root. Falls back to the raw source when PostCSS is not
 * configured or not installed in the user's project.
 */
export async function processCSS(
  host: StaticHost,
  filePath: string,
  source: string,
): Promise<string> {
  return runPostCSS(host.root, source, filePath);
}

// ── injectEntryCSSLinks ───────────────────────────────────────────────────────

/**
 * For static HTML files (SPA mode), find every
 * `<script type="module" src="...">` that points to a TS/JSX file, eagerly
 * bundle it so CSS lands in cssOutputCache, then inject `<link>` tags before
 * `</head>`. This mirrors the CSS-injection done by handlePageRouteInner for
 * file-based routes so that `import './style.css'` works in SPA entry points.
 */
export async function injectEntryCSSLinks(
  host: StaticHost,
  htmlFilePath: string,
  html: string,
): Promise<string> {
  const htmlDir = path.dirname(htmlFilePath);
  const scriptSrcRe =
    /<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/gi;
  const cssLinkTags: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = scriptSrcRe.exec(html)) !== null) {
    const src = match[1];
    // Only handle local TS/JSX/MJS entry points
    if (!/\.(tsx?|jsx?|mjs)$/.test(src)) continue;
    if (/^https?:\/\//.test(src)) continue;

    // Resolve relative to the HTML file's directory (strips leading /)
    const relSrc = src.replace(/^\//, "");
    const absoluteSrc = src.startsWith("/")
      ? path.join(host.root, relSrc)
      : path.resolve(htmlDir, src);

    if (!fs.existsSync(absoluteSrc)) continue;

    // Bundle to populate cssOutputCache (result cached; fast on repeat)
    await bundleFile(absoluteSrc, host.root, host.config?.resolve);
    const css = getCSSOutput(absoluteSrc);
    if (css) {
      const relPath = path
        .relative(host.root, absoluteSrc)
        .split(path.sep)
        .join("/");
      cssLinkTags.push(
        `<link rel="stylesheet" href="/__pyra/styles/${relPath}">`,
      );
    }
  }

  if (cssLinkTags.length === 0) return html;

  // Inject before </head> (or at the top of <body> as fallback)
  const linkBlock = cssLinkTags.join("\n  ");
  if (html.includes("</head>")) {
    return html.replace("</head>", `  ${linkBlock}\n</head>`);
  }
  return html.replace("<body>", `<head>\n  ${linkBlock}\n</head>\n<body>`);
}

// ── getContentType ────────────────────────────────────────────────────────────

/** Map a file extension to its MIME type. */
export function getContentType(ext: string): string {
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
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
  };
  return types[ext] || "text/plain";
}
