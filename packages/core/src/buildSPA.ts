import path from "node:path";
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import * as esbuild from "esbuild";
import pc from "picocolors";
import { log, getOutDir, type PyraConfig, type RouteManifest, type RenderMode } from "pyrajs-shared";
import { createPostCSSPlugin } from "./css-plugin.js";
import { type BuildOrchestratorOptions, type BuildResult } from "./types.js";

/** SPA Build
 * 
 * static build for entry-based SPA projects (no file-based routing).
 * Produces: dist/index.html + dist/assets/{main-HASH.js, main-HASH.css, chunks...}
 */
export async function buildSPA(
  options: BuildOrchestratorOptions,
): Promise<BuildResult> {
  const startTime = performance.now();

  const root = options.root || options.config.root || process.cwd();
  const outDir = path.resolve(
    root,
    options.outDir || getOutDir(options.config) || "dist",
  );
  const entry = path.resolve(root, options.config.entry as string);
  const base = options.config.build?.base || "/";
  const minify = options.minify ?? options.config.build?.minify ?? true;
  const sourcemap =
    options.sourcemap ?? options.config.build?.sourcemap ?? false;
  const silent = options.silent ?? false;
  const adapter = options.adapter;

  log.info("Building SPA for production...");

  // Clean output and create dist/assets/
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  const assetsDir = path.join(outDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });

  // Bundle the entry
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    minify,
    sourcemap,
    outdir: assetsDir,
    format: "esm",
    platform: "browser",
    target: options.config.build?.target || "es2020",
    splitting: options.config.build?.splitting ?? true,
    metafile: true,
    entryNames: "[name]-[hash]",
    chunkNames: "chunk-[hash]",
    assetNames: "[name]-[hash]",
    jsx: "automatic",
    jsxImportSource: "react",
    plugins: [createPostCSSPlugin(root), ...adapter.esbuildPlugins()],
    absWorkingDir: root,
    logLevel: "silent",
    loader: {
      ".ts": "ts",
      ".tsx": "tsx",
      ".jsx": "jsx",
      ".js": "js",
    },
  });

  // Find the main JS output and its CSS bundle from the metafile
  const entryRelative = path.relative(root, entry).split(path.sep).join("/");
  let mainScript: string | null = null;
  let mainCss: string | null = null;

  for (const [outputPath, meta] of Object.entries(result.metafile!.outputs)) {
    if (meta.entryPoint !== entryRelative) continue;
    mainScript = path
      .relative(outDir, path.resolve(root, outputPath))
      .split(path.sep)
      .join("/");
    if (meta.cssBundle) {
      mainCss = path
        .relative(outDir, path.resolve(root, meta.cssBundle))
        .split(path.sep)
        .join("/");
    }
    break;
  }

  // Read and transform index.html
  const htmlSrc = path.join(root, "index.html");
  let html: string;
  if (fs.existsSync(htmlSrc)) {
    html = fs.readFileSync(htmlSrc, "utf-8");
  } else {
    const containerId = options.config.appContainerId || "app";
    html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App</title>
</head>
<body>
  <div id="${containerId}"></div>
</body>
</html>`;
  }

  // Remove dev-time <script type="module" src="..."> tags (source file references)
  html = html.replace(
    /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'][^"']*["'][^>]*>(\s*)<\/script>[ \t]*\n?/gi,
    "",
  );
  // Also handle reversed attribute order: src="..." type="module"
  html = html.replace(
    /<script\b[^>]*\bsrc=["'][^"']*["'][^>]*\btype=["']module["'][^>]*>(\s*)<\/script>[ \t]*\n?/gi,
    "",
  );

  // Inject CSS <link> before </head>
  if (mainCss) {
    html = html.replace(
      "</head>",
      `  <link rel="stylesheet" crossorigin href="${base}${mainCss}">\n</head>`,
    );
  }

  // Inject JS <script> before </body>
  if (mainScript) {
    html = html.replace(
      "</body>",
      `  <script type="module" crossorigin src="${base}${mainScript}"></script>\n</body>`,
    );
  }

  fs.writeFileSync(path.join(outDir, "index.html"), html, "utf-8");

  // Copy public/ → dist/ if it exists
  const publicDir = path.join(root, "public");
  if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, outDir, { recursive: true });
  }

  const totalDurationMs = performance.now() - startTime;

  if (!silent) {
    printSPABuildReport(
      result.metafile!,
      outDir,
      assetsDir,
      totalDurationMs,
      options.config,
    );
  }

  log.success(`Build completed in ${(totalDurationMs / 1000).toFixed(2)}s`);

  return {
    manifest: buildEmptyManifest(adapter.name, base),
    clientOutputCount: Object.keys(result.metafile!.outputs).length,
    serverOutputCount: 0,
    totalDurationMs,
  };
}

// Helpers
function buildEmptyManifest(adapterName: string, base: string): RouteManifest {
  return {
    version: 1,
    adapter: adapterName,
    base,
    builtAt: new Date().toISOString(),
    renderMode: "spa" as RenderMode,
    routes: {},
    assets: {},
  };
}

function printSPABuildReport(
  meta: esbuild.Metafile,
  outDir: string,
  assetsDir: string,
  totalDurationMs: number,
  config?: PyraConfig,
): void {
  const warnSize = config?.buildReport?.warnSize ?? 51200;

  console.log("");
  console.log(
    `  ${pc.bold("File")}                                       ${pc.bold("Size")}`,
  );
  console.log("  " + pc.dim("\u2500".repeat(54)));

  let totalJS = 0;
  let totalCSS = 0;

  // Sort: entry first, then chunks
  const outputs = Object.entries(meta.outputs).sort(([a], [b]) => {
    const isChunkA = path.basename(a).startsWith("chunk-");
    const isChunkB = path.basename(b).startsWith("chunk-");
    return Number(isChunkA) - Number(isChunkB);
  });

  for (const [outputPath, outMeta] of outputs) {
    const name = path
      .relative(outDir, path.resolve(process.cwd(), outputPath))
      .split(path.sep)
      .join("/");
    const ext = path.extname(outputPath);
    const size = outMeta.bytes;

    if (ext === ".js") {
      totalJS += size;
      const sizeStr = formatSize(size);
      const warn = size > warnSize ? pc.yellow(" \u26A0") : "";
      console.log(`  ${pc.cyan(name.padEnd(42))} ${sizeStr.padStart(9)}${warn}`);
    } else if (ext === ".css") {
      totalCSS += size;
      console.log(`  ${pc.magenta(name.padEnd(42))} ${formatSize(size).padStart(9)}`);
    }
  }

  console.log("  " + pc.dim("\u2500".repeat(54)));

  // Gzip estimate
  let gzipStr = "";
  try {
    let totalGzipped = 0;
    for (const [outputPath] of Object.entries(meta.outputs)) {
      const ext = path.extname(outputPath);
      if (ext === ".js" || ext === ".css") {
        const content = fs.readFileSync(path.resolve(process.cwd(), outputPath));
        totalGzipped += gzipSync(content, { level: 6 }).length;
      }
    }
    if (totalGzipped > 0) {
      gzipStr = `   ${pc.dim(`(gzip: ${formatSize(totalGzipped)})`)}`;
    }
  } catch {
    // Gzip estimate is optional
  }

  console.log(
    `  Total JS: ${formatSize(totalJS).padStart(9)}   CSS: ${formatSize(totalCSS).padStart(9)}${gzipStr}`,
  );
  console.log("");

  const assetCount = countFilesRecursive(assetsDir);
  console.log(
    `  Output:   dist/index.html + ${assetCount} asset files in dist/assets/`,
  );
  console.log(`  Built in ${(totalDurationMs / 1000).toFixed(1)}s`);
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "-";
  const kb = bytes / 1024;
  if (kb < 1) return `${bytes} B`;
  return `${kb.toFixed(1)} KB`;
}

function countFilesRecursive(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countFilesRecursive(path.join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}
