import * as esbuild from "esbuild";
import path from "node:path";
import type { ScanResult } from "../scanner.js";

/**
 * Build server output map: routeId → relative path to server entry.
 */
export function buildServerOutputMap(
  meta: esbuild.Metafile,
  entryRouteMap: Map<string, { routeId: string; type: "page" | "api" }>,
  serverOutDir: string,
  root: string,
): Map<string, string> {
  const result = new Map<string, string>();

  for (const [outputPath, outputMeta] of Object.entries(meta.outputs)) {
    if (!outputMeta.entryPoint) continue;

    const entryAbsolute = path.resolve(root, outputMeta.entryPoint);
    const routeInfo = entryRouteMap.get(entryAbsolute);
    if (!routeInfo) continue;

    const relativePath = path
      .relative(serverOutDir, path.resolve(root, outputPath))
      .split(path.sep)
      .join("/");
    result.set(routeInfo.routeId, relativePath);
  }

  return result;
}

/**
 * Build server output map for middleware, layout, and error boundary files.
 * Returns filePath → relative server output path.
 */
export function buildServerMwLayoutOutputMap(
  meta: esbuild.Metafile,
  scanResult: ScanResult,
  serverOutDir: string,
  root: string,
): Map<string, string> {
  // Collect all middleware + layout + error boundary source file paths
  const knownPaths = new Set<string>();
  for (const mw of scanResult.middlewares) knownPaths.add(mw.filePath);
  for (const layout of scanResult.layouts) knownPaths.add(layout.filePath);
  for (const err of scanResult.errors) knownPaths.add(err.filePath);
  if (scanResult.notFoundPage) knownPaths.add(scanResult.notFoundPage);

  const result = new Map<string, string>();

  for (const [outputPath, outputMeta] of Object.entries(meta.outputs)) {
    if (!outputMeta.entryPoint) continue;
    const entryAbsolute = path.resolve(root, outputMeta.entryPoint);
    if (!knownPaths.has(entryAbsolute)) continue;

    const relativePath = path
      .relative(serverOutDir, path.resolve(root, outputPath))
      .split(path.sep)
      .join("/");
    result.set(entryAbsolute, relativePath);
  }

  return result;
}
