import fs from "node:fs";
import path from "node:path";
import type { PyraAdapter, RouteGraph, RouteNode } from "pyrajs-shared";
import { scanRoutes, type ScanResult } from "../scanner.js";
import { createRouter } from "../router.js";
import pc from "picocolors";

// ── RoutesHost ────────────────────────────────────────────────────────────────

export interface RoutesHost {
  adapter: PyraAdapter | undefined;
  routesDir: string | undefined;
  // Mutable — buildRouteGraph assigns these through the interface
  router: RouteGraph | null;
  errorFiles: Map<string, string>;
  notFoundPage: string | undefined;
}

// ── buildRouteGraph ───────────────────────────────────────────────────────────

/**
 * Scan the routes directory and build the RouteGraph, storing it on the host.
 * Also updates `errorFiles` and `notFoundPage` for error/404 handling.
 * Called at startup and whenever route files are added or changed.
 */
export async function buildRouteGraph(host: RoutesHost): Promise<void> {
  if (!host.adapter || !host.routesDir) return;

  const scanResult = await scanRoutes(host.routesDir, [
    ...host.adapter.fileExtensions,
  ]);
  host.router = createRouter(scanResult);

  // v1.0: Store error boundary files and 404 page reference
  host.errorFiles.clear();
  for (const err of scanResult.errors) {
    host.errorFiles.set(err.dirId, err.filePath);
  }
  host.notFoundPage = scanResult.notFoundPage;

  // Print detailed route table at startup
  printRouteTable(host, scanResult);
}

// ── printRouteTable ───────────────────────────────────────────────────────────

/** Print the dev startup route table to stdout. */
export function printRouteTable(
  host: RoutesHost,
  scanResult: ScanResult,
): void {
  if (!host.router) return;

  const pages = host.router.pageRoutes();
  const apis = host.router.apiRoutes();
  const totalRoutes = pages.length + apis.length;

  console.log("");
  console.log(
    `  ${pc.bold("Routes")} ${pc.dim(`(${totalRoutes} routes, ${pages.length} pages, ${apis.length} APIs)`)}`,
  );
  console.log("");

  // Page Routes
  if (pages.length > 0) {
    console.log(`  ${pc.bold("Page Routes")}`);
    console.log(`  ${pc.dim("\u2500".repeat(64))}`);

    for (const route of pages) {
      const pattern = route.pattern.padEnd(24);
      const file = pc.dim(path.basename(route.filePath));

      const annotations: string[] = [];

      if (route.layoutId) {
        const layoutName =
          route.layoutId === "/" ? "root" : route.layoutId.slice(1);
        annotations.push(`${pc.dim("layout:")} ${pc.cyan(layoutName)}`);
      }

      if (route.middlewarePaths.length > 0) {
        const mwNames = route.middlewarePaths.map((p) => {
          const dir = path.dirname(path.relative(host.routesDir!, p));
          return dir === "." ? "root" : dir;
        });
        annotations.push(`${pc.dim("mw:")} ${pc.yellow(mwNames.join(", "))}`);
      }

      const annotStr =
        annotations.length > 0 ? `  ${annotations.join("  ")}` : "";
      console.log(`  ${pc.green(pattern)}  ${file}${annotStr}`);
    }
    console.log("");
  }

  // API Routes
  if (apis.length > 0) {
    console.log(`  ${pc.bold("API Routes")}`);
    console.log(`  ${pc.dim("\u2500".repeat(64))}`);

    for (const route of apis) {
      const pattern = route.pattern.padEnd(24);
      const file = pc.dim(path.basename(route.filePath));

      const methods = detectApiMethods(route);
      const methodStr =
        methods.length > 0 ? `  ${pc.cyan(methods.join(" "))}` : "";

      console.log(`  ${pc.green(pattern)}  ${file}${methodStr}`);
    }
    console.log("");
  }

  // Middleware summary
  if (scanResult.middlewares.length > 0) {
    console.log(`  ${pc.bold("Middleware")}`);
    console.log(`  ${pc.dim("\u2500".repeat(64))}`);
    for (const mw of scanResult.middlewares) {
      const relPath = path.relative(host.routesDir!, mw.filePath);
      const scope = mw.dirId === "/" ? "all routes (root)" : `${mw.dirId}/**`;
      console.log(
        `  ${pc.dim(relPath.split(path.sep).join("/"))}  ${pc.dim("\u2192")} ${scope}`,
      );
    }
    console.log("");
  }

  // Layout summary
  if (scanResult.layouts.length > 0) {
    console.log(`  ${pc.bold("Layouts")}`);
    console.log(`  ${pc.dim("\u2500".repeat(64))}`);
    for (const layout of scanResult.layouts) {
      const relPath = path.relative(host.routesDir!, layout.filePath);
      const scope =
        layout.id === "/"
          ? "all pages (root)"
          : getLayoutScope(layout.id, pages);
      console.log(
        `  ${pc.dim(relPath.split(path.sep).join("/"))}  ${pc.dim("\u2192")} ${scope}`,
      );
    }
    console.log("");
  }

  // Error boundary summary
  if (scanResult.errors.length > 0) {
    console.log(`  ${pc.bold("Error Boundaries")}`);
    console.log(`  ${pc.dim("\u2500".repeat(64))}`);
    for (const err of scanResult.errors) {
      const relPath = path.relative(host.routesDir!, err.filePath);
      const scope =
        err.dirId === "/" ? "all routes (root)" : `${err.dirId}/**`;
      console.log(
        `  ${pc.dim(relPath.split(path.sep).join("/"))}  ${pc.dim("\u2192")} ${scope}`,
      );
    }
    console.log("");
  }

  // 404 page
  if (scanResult.notFoundPage) {
    const relPath = path.relative(host.routesDir!, scanResult.notFoundPage);
    console.log(
      `  ${pc.bold("404 Page")}  ${pc.dim(relPath.split(path.sep).join("/"))}`,
    );
    console.log("");
  }
}

// ── detectApiMethods ──────────────────────────────────────────────────────────

/**
 * Detect exported HTTP methods from an API route file via regex scan.
 * Avoids importing the module at startup — reads the source file directly.
 */
export function detectApiMethods(route: RouteNode): string[] {
  try {
    const source = fs.readFileSync(route.filePath, "utf-8");
    const methods = [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "PATCH",
      "HEAD",
      "OPTIONS",
    ];
    return methods.filter((method) => {
      const pattern = new RegExp(
        `export\\s+(async\\s+)?function\\s+${method}\\b|export\\s+(const|let)\\s+${method}\\b`,
      );
      return pattern.test(source);
    });
  } catch {
    return [];
  }
}

// ── getLayoutScope ────────────────────────────────────────────────────────────

/** Return a human-readable scope string for a layout (e.g. for the route table). */
export function getLayoutScope(
  layoutId: string,
  pages: RouteNode[],
): string {
  const matching = pages
    .filter(
      (p) =>
        p.layoutId === layoutId ||
        p.id.startsWith(layoutId + "/") ||
        p.id === layoutId,
    )
    .map((p) => p.pattern);
  if (matching.length <= 3) return matching.join(", ");
  return `${matching.slice(0, 2).join(", ")}, +${matching.length - 2} more`;
}
