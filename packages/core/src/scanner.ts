import { readdir } from "node:fs/promises";
import { join, relative, sep, posix } from "node:path";
import type { RouteNode } from "pyrajs-shared";

// Internal types for scanner output

// A layout discovered during scanning.
export interface ScannedLayout {
  id: string; // Route-style ID: '/' for root layout, '/blog' for blog layout for example
  filePath: string; // Absoulte file path
}

// A middleware file discovered during scanning.
export interface ScannedMiddleware {
  dirId: string; // Directory-level ID: '/' for root, '/dashboard' for dashboard dir.
  filePath: string; // Absolute file path.
}

// The full result of scanning the routes directory.
export interface ScanResult {
  routes: RouteNode[];
  layouts: ScannedLayout[];
  middlewares: ScannedMiddleware[];
}

// Helper functions

/** Convert a filesystem path segment to a route ID segment. */
function toRouteId(dirPath: string, routesDir: string): string {
  const rel = relative(routesDir, dirPath);
  if (rel === "" || rel === ".") return "/";
  // Normalize to posix separators
  const posixRel = rel.split(sep).join(posix.sep);
  return "/" + posixRel;
}

/** Convert a route ID to a URL pattern: /blog/[slug] → /blog/:slug */
function toUrlPattern(routeId: string): string {
  return routeId.replace(/\[([^\]]+)\]/g, ":$1");
}

/** Extract dynamic parameter names from a route ID. */
function extractParams(routeId: string): string[] {
  const params: string[] = [];
  const regex = /\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(routeId)) !== null) {
    params.push(match[1]);
  }
  return params;
}

/** Check if a filename matches any of the sentinel page file patterns. */
function isPageFile(filename: string, extensions: string[]): boolean {
  return extensions.some((ext) => filename === `page${ext}`);
}

/** Check if a filename is an API route sentinel. */
function isRouteFile(filename: string): boolean {
  return filename === "route.ts" || filename === "route.js";
}

/** Check if a filename matches a layout pattern. */
function isLayoutFile(filename: string, extensions: string[]): boolean {
  return extensions.some((ext) => filename === `layout${ext}`);
}

/** Check if a filename is a middleware sentinel. */
function isMiddlewareFile(filename: string): boolean {
  return filename === "middleware.ts" || filename === "middleware.js";
}

// Scanner 

/**
 * Scan a routes directory and discover all routes, layouts, and middleware.
 *
 * Walks the directory tree recursively. For each directory, checks for
 * sentinel filenames (page.*, route.*, layout.*, middleware.*) to determine
 * what exists at that path.
 *
 * @param routesDir   - Absolute path to the routes directory (e.g., src/routes/)
 * @param fileExtensions - Extensions the adapter handles: ['.tsx', '.jsx'] for React
 * @returns Scanned routes, layouts, and middleware — ready for the router to consume.
 */
export async function scanRoutes(
  routesDir: string,
  fileExtensions: string[] = [".tsx", ".jsx"],
): Promise<ScanResult> {
  const routes: RouteNode[] = [];
  const layouts: ScannedLayout[] = [];
  const middlewares: ScannedMiddleware[] = [];

  // Phase 1: Walk the directory tree and discover everything
  await walkDirectory(
    routesDir,
    routesDir,
    fileExtensions,
    routes,
    layouts,
    middlewares,
  );

  // Phase 2: Compute layout and middleware ancestry for each route
  resolveAncestry(routes, layouts, middlewares);

  // Phase 3: Compute parent-child relationships
  resolveChildren(routes);

  return { routes, layouts, middlewares };
}

/**
 * Recursively walk a directory, discovering routes, layouts, and middleware.
 */
async function walkDirectory(
  currentDir: string,
  routesDir: string,
  extensions: string[],
  routes: RouteNode[],
  layouts: ScannedLayout[],
  middlewares: ScannedMiddleware[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    // Directory doesn't exist or isn't readable — not an error for the scanner
    return;
  }

  const dirId = toRouteId(currentDir, routesDir);
  let hasPage = false;
  let pageFilePath = "";
  let hasRoute = false;
  let routeFilePath = "";

  // First pass: check for sentinel files in this directory
  for (const entry of entries) {
    if (!entry.isFile()) continue;

    if (isPageFile(entry.name, extensions)) {
      hasPage = true;
      pageFilePath = join(currentDir, entry.name);
    } else if (isRouteFile(entry.name)) {
      hasRoute = true;
      routeFilePath = join(currentDir, entry.name);
    } else if (isLayoutFile(entry.name, extensions)) {
      layouts.push({
        id: dirId,
        filePath: join(currentDir, entry.name),
      });
    } else if (isMiddlewareFile(entry.name)) {
      middlewares.push({
        dirId,
        filePath: join(currentDir, entry.name),
      });
    }
  }

  // Validate: cannot have both page.* and route.* in the same directory
  if (hasPage && hasRoute) {
    throw new Error(
      `Route conflict in ${currentDir}: found both a page route (${pageFilePath}) and an API route (${routeFilePath}). ` +
        `A directory cannot serve as both a page and an API endpoint.`,
    );
  }

  // Register the route if one was found
  if (hasPage) {
    const routeId = dirId;
    routes.push({
      id: routeId,
      pattern: toUrlPattern(routeId),
      filePath: pageFilePath,
      type: "page",
      params: extractParams(routeId),
      catchAll: false,
      middlewarePaths: [], // resolved in phase 2
      children: [], // resolved in phase 3
    });
  } else if (hasRoute) {
    const routeId = dirId;
    routes.push({
      id: routeId,
      pattern: toUrlPattern(routeId),
      filePath: routeFilePath,
      type: "api",
      params: extractParams(routeId),
      catchAll: false,
      middlewarePaths: [], // resolved in phase 2
      children: [], // resolved in phase 3
    });
  }

  // Second pass: recurse into subdirectories
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await walkDirectory(
        join(currentDir, entry.name),
        routesDir,
        extensions,
        routes,
        layouts,
        middlewares,
      );
    }
  }
}

/**
 * For each route, find its nearest ancestor layout and collect
 * all middleware files from root down to its directory.
 *
 * Layout ancestry: walk up from the route's directory toward routesDir,
 * find the nearest layout. The route's layoutId points to it.
 *
 * Middleware ancestry: collect ALL middleware.ts files from root to the
 * route's directory, outermost first. Stored as middlewarePaths.
 */
function resolveAncestry(
  routes: RouteNode[],
  layouts: ScannedLayout[],
  middlewares: ScannedMiddleware[],
): void {
  // Index layouts and middlewares by their directory ID for quick lookup
  const layoutByDir = new Map<string, ScannedLayout>();
  for (const layout of layouts) {
    layoutByDir.set(layout.id, layout);
  }

  const middlewareByDir = new Map<string, ScannedMiddleware>();
  for (const mw of middlewares) {
    middlewareByDir.set(mw.dirId, mw);
  }

  for (const route of routes) {
    // Collect ancestor directory IDs from root to this route's directory
    const ancestorDirs = getAncestorDirIds(route.id);

    // Find nearest layout: walk from innermost to outermost
    // The layout in the route's OWN directory counts too
    let nearestLayoutId: string | undefined;
    for (let i = ancestorDirs.length - 1; i >= 0; i--) {
      if (layoutByDir.has(ancestorDirs[i])) {
        nearestLayoutId = ancestorDirs[i];
        break;
      }
    }

    // Collect middleware paths: outermost (root) to innermost (route's dir)
    const mwPaths: string[] = [];
    for (const dirId of ancestorDirs) {
      const mw = middlewareByDir.get(dirId);
      if (mw) {
        mwPaths.push(mw.filePath);
      }
    }

    // RouteNode is defined as readonly, so we cast to assign during construction
    (route as { layoutId?: string }).layoutId = nearestLayoutId;
    (route as { middlewarePaths: string[] }).middlewarePaths = mwPaths;
  }
}

/**
 * Get all ancestor directory IDs from root (/) to the given route ID.
 * Example: '/blog/[slug]' → ['/', '/blog', '/blog/[slug]']
 */
function getAncestorDirIds(routeId: string): string[] {
  if (routeId === "/") return ["/"];

  const segments = routeId.split("/").filter(Boolean);
  const ancestors: string[] = ["/"];
  let current = "";
  for (const seg of segments) {
    current += "/" + seg;
    ancestors.push(current);
  }
  return ancestors;
}

/**
 * Compute parent-child relationships between routes.
 * A route B is a child of route A if B's ID starts with A's ID + '/'
 * and there's no intermediate route between them.
 */
function resolveChildren(routes: RouteNode[]): void {
  // Sort by depth (fewer segments first) so parents come before children
  const sorted = [...routes].sort((a, b) => {
    const depthA = a.id === "/" ? 0 : a.id.split("/").length - 1;
    const depthB = b.id === "/" ? 0 : b.id.split("/").length - 1;
    return depthA - depthB;
  });

  for (let i = 0; i < sorted.length; i++) {
    const parent = sorted[i];
    const prefix = parent.id === "/" ? "/" : parent.id + "/";

    for (let j = i + 1; j < sorted.length; j++) {
      const candidate = sorted[j];
      // Check if candidate is directly under parent (no intermediate route)
      if (candidate.id === parent.id) continue;

      const isUnder =
        parent.id === "/"
          ? candidate.id.startsWith("/")
          : candidate.id.startsWith(prefix);

      if (isUnder) {
        // Check no other route sits between parent and candidate
        const between = candidate.id.substring(prefix.length);
        const hasIntermediate = routes.some(
          (r) =>
            r.id !== parent.id &&
            r.id !== candidate.id &&
            candidate.id.startsWith(r.id === "/" ? "/" : r.id + "/") &&
            r.id.startsWith(prefix) &&
            r.id.length > parent.id.length &&
            r.id.length < candidate.id.length,
        );

        if (!hasIntermediate) {
          (parent as { children: string[] }).children.push(candidate.id);
        }
      }
    }
  }
}
