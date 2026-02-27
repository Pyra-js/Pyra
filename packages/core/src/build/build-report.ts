import { gzipSync } from "node:zlib";
import path from "node:path";
import fs from "node:fs";
import pc from "picocolors";
import type { RouteManifest, PyraConfig } from "pyrajs-shared";

export function printBuildReport(
  manifest: RouteManifest,
  totalDurationMs: number,
  clientOutDir: string,
  serverOutDir: string,
  config?: PyraConfig,
): void {
  const warnSize = config?.buildReport?.warnSize ?? 51200; // 50 KB default

  // Exclude the internal __404 sentinel; sort pages before APIs, then alphabetically.
  const sortedRoutes = Object.values(manifest.routes)
    .filter((r) => r.id !== "__404")
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "page" ? -1 : 1;
      return a.pattern.localeCompare(b.pattern);
    });

  let pageCount = 0;
  let apiCount = 0;
  let ssgCount = 0;
  let prerenderTotal = 0;
  let totalJS = 0;
  let totalCSS = 0;

  // Column geometry
  const ROUTE_W = 32;
  const MODE_W = 8;
  const JS_W = 10;
  const SEP = "\u2500".repeat(70);

  // ── Header ───────────────────────────────────────────────────────────────
  console.log("");
  console.log(
    `  ${pc.bold("Route".padEnd(ROUTE_W))}${pc.bold("Mode".padEnd(MODE_W + 2))}${pc.bold("Client JS".padStart(JS_W))}   ${pc.bold("CSS")}`,
  );
  console.log("  " + pc.dim(SEP));

  // ── Rows ─────────────────────────────────────────────────────────────────
  for (const entry of sortedRoutes) {
    // Truncate long paths so the table stays narrow
    const truncated =
      entry.pattern.length > ROUTE_W - 1
        ? entry.pattern.slice(0, ROUTE_W - 2) + "\u2026"
        : entry.pattern;
    const routeCol = truncated.padEnd(ROUTE_W);

    if (entry.type === "page") {
      pageCount++;
      const routeMode = entry.renderMode ?? "ssr";

      // Mode label — colored by rendering strategy
      let modeLabel: string;
      if (routeMode === "ssg") {
        ssgCount++;
        const countSuffix =
          entry.prerenderedCount && entry.prerenderedCount > 1
            ? `(${entry.prerenderedCount})`
            : "";
        prerenderTotal += entry.prerenderedCount ?? 1;
        modeLabel = pc.green(("SSG" + countSuffix).padEnd(MODE_W));
      } else if (routeMode === "spa") {
        modeLabel = pc.yellow("SPA".padEnd(MODE_W));
      } else {
        modeLabel = pc.blue("SSR".padEnd(MODE_W));
      }

      // JS size — sum of client entry + shared chunks
      let jsSize = 0;
      if (entry.clientEntry) {
        const asset = manifest.assets[entry.clientEntry];
        if (asset) jsSize += asset.size;
      }
      for (const chunk of entry.clientChunks ?? []) {
        const asset = manifest.assets[chunk];
        if (asset) jsSize += asset.size;
      }
      totalJS += jsSize;

      // CSS size
      let cssSize = 0;
      for (const css of entry.css ?? []) {
        const asset = manifest.assets[css];
        if (asset) cssSize += asset.size;
      }
      totalCSS += cssSize;

      // Warning flag placed AFTER the number so column alignment is preserved
      const jsRaw = formatSize(jsSize).padStart(JS_W);
      const warn = jsSize > warnSize;
      const jsFull = warn
        ? pc.yellow(jsRaw) + "  " + pc.yellow("\u26a0")
        : jsRaw + "   ";

      const cssFull =
        cssSize > 0
          ? formatSize(cssSize).padStart(8)
          : pc.dim("\u2014".padStart(8));

      console.log(`  ${pc.cyan(routeCol)}${modeLabel}  ${jsFull}  ${cssFull}`);
    } else {
      apiCount++;

      // Show HTTP methods in the Mode column for API routes
      const methods = entry.methods?.join(" ") ?? "\u2014";
      const modeLabel = pc.dim(methods.padEnd(MODE_W));
      const dash = pc.dim("\u2014");

      console.log(
        `  ${pc.dim(routeCol)}${modeLabel}  ${"\u2014".padStart(JS_W)}     ${dash}`,
      );
    }
  }

  console.log("  " + pc.dim(SEP));

  // ── Totals ────────────────────────────────────────────────────────────────
  // Silence the unused variable warning — prerenderTotal is computed for
  // future use (e.g. "12 pages prerendered") but not yet shown in the footer.
  void prerenderTotal;
  void totalCSS;

  const pagePart = `${pageCount} page${pageCount !== 1 ? "s" : ""}`;
  const apiPart = apiCount > 0 ? ` · ${apiCount} API` : "";
  const ssgPart = ssgCount > 0 ? ` · ${ssgCount} SSG` : "";
  const countLabel = pc.dim(
    (pagePart + apiPart + ssgPart).padEnd(ROUTE_W + MODE_W),
  );

  const clientDir = path.dirname(clientOutDir);
  const gzipSize = estimateGzipSize(clientDir);
  const gzipPart =
    gzipSize > 0 ? pc.dim(`   gzip ~${formatSize(gzipSize)}`) : "";

  console.log(
    `  ${countLabel}  ${formatSize(totalJS).padStart(JS_W)}${gzipPart}`,
  );
  console.log("");

  // ── Shared chunks ─────────────────────────────────────────────────────────
  const sharedChunks = getSharedChunks(manifest);
  if (sharedChunks.length > 0) {
    console.log(`  ${pc.bold("Shared chunks")}`);
    for (const chunk of sharedChunks) {
      const sizeStr = formatSize(chunk.size).padStart(10);
      const usage = pc.dim(
        `shared by ${chunk.usedBy} page${chunk.usedBy !== 1 ? "s" : ""}`,
      );
      console.log(`  ${pc.dim(chunk.name.padEnd(32))} ${sizeStr}  ${usage}`);
    }
    console.log("");
  }

  // ── Output dirs ───────────────────────────────────────────────────────────
  const clientFiles = countFilesRecursive(clientDir);
  const serverFiles = countFilesRecursive(serverOutDir);
  console.log(
    `  ${pc.dim("dist/client/")}   ${clientFiles} files    ${pc.dim("dist/server/")}   ${serverFiles} files`,
  );
  console.log("");

  // ── Final timing line ─────────────────────────────────────────────────────
  const ms = Math.round(totalDurationMs);
  const durationStr = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
  console.log(`  ${pc.green("\u279c")}  built in ${pc.bold(durationStr)}`);
  console.log("");
}

/** Estimate gzip size of all JS/CSS files in the client output. */
function estimateGzipSize(clientDir: string): number {
  if (!fs.existsSync(clientDir)) return 0;

  let totalGzipped = 0;
  const assetsDir = path.join(clientDir, "assets");
  if (!fs.existsSync(assetsDir)) return 0;

  try {
    const files = fs.readdirSync(assetsDir);
    for (const file of files) {
      if (file.endsWith(".js") || file.endsWith(".css")) {
        const content = fs.readFileSync(path.join(assetsDir, file));
        const gzipped = gzipSync(content, { level: 6 });
        totalGzipped += gzipped.length;
      }
    }
  } catch {
    // Ignore errors — gzip estimate is optional
  }

  return totalGzipped;
}

/** Identify shared chunks and how many page routes use each. */
function getSharedChunks(
  manifest: RouteManifest,
): { name: string; size: number; usedBy: number }[] {
  const chunkUsage = new Map<string, number>();

  for (const entry of Object.values(manifest.routes)) {
    if (entry.type !== "page") continue;
    for (const chunk of entry.clientChunks || []) {
      chunkUsage.set(chunk, (chunkUsage.get(chunk) || 0) + 1);
    }
  }

  const result: { name: string; size: number; usedBy: number }[] = [];
  for (const [chunk, usedBy] of chunkUsage) {
    const asset = manifest.assets[chunk];
    const size = asset?.size || 0;
    const name = path.basename(chunk);
    result.push({ name, size, usedBy });
  }

  return result.sort((a, b) => b.size - a.size);
}

/** Format a byte count as a human-readable size string. */
function formatSize(bytes: number): string {
  if (bytes === 0) return "-";
  const kb = bytes / 1024;
  if (kb < 1) return `${bytes} B`;
  return `${kb.toFixed(1)} KB`;
}

/** Count all files in a directory recursively. */
function countFilesRecursive(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFilesRecursive(fullPath);
    } else {
      count++;
    }
  }
  return count;
}
