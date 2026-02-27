import * as esbuild from "esbuild";
import path from "node:path";
import type {
  PyraAdapter,
  RouteManifest,
  ManifestRouteEntry,
  ManifestAsset,
  RouteGraph,
  RenderMode,
  CacheConfig,
  PrerenderConfig,
} from "pyrajs-shared";
import type { ScanResult } from "../scanner.js";
import { getAncestorDirIds } from "./build-utils.js";

/** Default HTML document shell used when the adapter provides none. */
export const DEFAULT_SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--pyra-head-->
</head>
<body>
  <div id="__CONTAINER_ID__"><!--pyra-outlet--></div>
</body>
</html>`;

/** Assemble the final RouteManifest from all collected build data. */
export function assembleManifest(
  adapter: PyraAdapter,
  base: string,
  globalMode: RenderMode,
  router: RouteGraph,
  clientOutputMap: Map<
    string,
    { entry: string; chunks: string[]; css: string[] }
  >,
  serverOutputMap: Map<string, string>,
  hasLoadMap: Map<string, boolean>,
  apiMethodsMap: Map<string, string[]>,
  prerenderMap: Map<string, true | PrerenderConfig>,
  cacheMap: Map<string, CacheConfig>,
  renderModeMap: Map<string, RenderMode>,
  clientMeta: esbuild.Metafile,
  clientOutDir: string,
  scanResult: ScanResult,
  serverMwLayoutOutputMap: Map<string, string>,
  clientLayoutOutputMap: Map<string, string>,
  clientErrorOutputMap: Map<string, string>,
): RouteManifest {
  const routes: Record<string, ManifestRouteEntry> = {};

  // Build lookup: middleware dirId → server output relative path
  const mwServerPaths = new Map<string, string>();
  for (const mw of scanResult.middlewares) {
    const serverPath = serverMwLayoutOutputMap.get(mw.filePath);
    if (serverPath) mwServerPaths.set(mw.dirId, serverPath);
  }

  // Build lookup: layout id → server output relative path
  const layoutServerPaths = new Map<string, string>();
  for (const layout of scanResult.layouts) {
    const serverPath = serverMwLayoutOutputMap.get(layout.filePath);
    if (serverPath) layoutServerPaths.set(layout.id, serverPath);
  }

  // Build lookup: error boundary dirId → server output relative path
  const errorServerPaths = new Map<string, string>();
  for (const err of scanResult.errors) {
    const serverPath = serverMwLayoutOutputMap.get(err.filePath);
    if (serverPath) errorServerPaths.set(err.dirId, serverPath);
  }

  function resolveLayoutChain(routeId: string): string[] {
    const ancestors = getAncestorDirIds(routeId);
    const chain: string[] = [];
    for (const dirId of ancestors) {
      if (layoutServerPaths.has(dirId)) chain.push(dirId);
    }
    return chain;
  }

  function resolveMiddlewareBundledPaths(middlewarePaths: string[]): string[] {
    const result: string[] = [];
    for (const mw of scanResult.middlewares) {
      if (middlewarePaths.includes(mw.filePath)) {
        const serverPath = mwServerPaths.get(mw.dirId);
        if (serverPath) result.push(serverPath);
      }
    }
    return result;
  }

  // Page routes
  for (const route of router.pageRoutes()) {
    const clientOutput = clientOutputMap.get(route.id);
    const serverEntry = serverOutputMap.get(route.id);
    const routeCache = cacheMap.get(route.id);
    const layoutChain = resolveLayoutChain(route.id);
    const layoutEntries = layoutChain
      .map((id) => layoutServerPaths.get(id)!)
      .filter(Boolean);
    const layoutClientEntries = layoutChain
      .map((id) => clientLayoutOutputMap.get(id)!)
      .filter(Boolean);
    const mwBundled = resolveMiddlewareBundledPaths(route.middlewarePaths);

    const errorBoundaryEntry = route.errorBoundaryId
      ? errorServerPaths.get(route.errorBoundaryId)
      : undefined;
    const errorBoundaryClientEntry = route.errorBoundaryId
      ? clientErrorOutputMap.get(route.errorBoundaryId)
      : undefined;

    const routeMode = renderModeMap.get(route.id) ?? globalMode;

    routes[route.id] = {
      id: route.id,
      pattern: route.pattern,
      type: "page",
      renderMode: routeMode,
      clientEntry: clientOutput?.entry,
      clientChunks: clientOutput?.chunks?.length
        ? clientOutput.chunks
        : undefined,
      css: clientOutput?.css?.length ? clientOutput.css : undefined,
      ssrEntry: routeMode !== "spa" ? serverEntry : undefined,
      hasLoad: hasLoadMap.get(route.id) || false,
      cache: routeCache,
      layouts: layoutChain.length ? layoutChain : undefined,
      layoutEntries: layoutEntries.length ? layoutEntries : undefined,
      layoutClientEntries: layoutClientEntries.length
        ? layoutClientEntries
        : undefined,
      middleware: mwBundled.length ? mwBundled : undefined,
      errorBoundaryEntry,
      errorBoundaryClientEntry,
    };
  }

  // API routes
  for (const route of router.apiRoutes()) {
    const serverEntry = serverOutputMap.get(route.id);
    const mwBundled = resolveMiddlewareBundledPaths(route.middlewarePaths);

    const errorBoundaryEntry = route.errorBoundaryId
      ? errorServerPaths.get(route.errorBoundaryId)
      : undefined;
    const errorBoundaryClientEntry = route.errorBoundaryId
      ? clientErrorOutputMap.get(route.errorBoundaryId)
      : undefined;

    routes[route.id] = {
      id: route.id,
      pattern: route.pattern,
      type: "api",
      serverEntry,
      methods: apiMethodsMap.get(route.id),
      middleware: mwBundled.length ? mwBundled : undefined,
      errorBoundaryEntry,
      errorBoundaryClientEntry,
    };
  }

  // Add 404 page to manifest if present
  if (scanResult.notFoundPage) {
    const notFoundServerPath = serverMwLayoutOutputMap.get(
      scanResult.notFoundPage,
    );
    routes["__404"] = {
      id: "__404",
      pattern: "/__404",
      type: "page",
      ssrEntry: notFoundServerPath,
      hasLoad: false,
    };
  }

  // Asset inventory from client metafile
  const assets: Record<string, ManifestAsset> = {};
  const clientDir = path.dirname(clientOutDir); // dist/client/

  for (const [outputPath, outputMeta] of Object.entries(clientMeta.outputs)) {
    const absOutput = path.resolve(process.cwd(), outputPath);
    const relativePath = path
      .relative(clientDir, absOutput)
      .split(path.sep)
      .join("/");
    const ext = path.extname(outputPath);
    const basename = path.basename(outputPath, ext);
    const hashMatch = basename.match(/-([A-Za-z0-9]+)$/);
    const hash = hashMatch ? hashMatch[1] : "";

    assets[relativePath] = {
      file: relativePath,
      hash,
      size: outputMeta.bytes,
      type: getMimeType(ext),
    };
  }

  return {
    version: 1,
    adapter: adapter.name,
    base,
    builtAt: new Date().toISOString(),
    renderMode: globalMode,
    routes,
    assets,
  };
}

/** Build an empty manifest when no routes are found. */
export function buildEmptyManifest(
  adapterName: string,
  base: string,
  renderMode: RenderMode = "ssr",
): RouteManifest {
  return {
    version: 1,
    adapter: adapterName,
    base,
    builtAt: new Date().toISOString(),
    renderMode,
    routes: {},
    assets: {},
  };
}

/** Get MIME type from file extension. */
export function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".html": "text/html",
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
    ".map": "application/json",
  };
  return mimeTypes[ext] || "application/octet-stream";
}
