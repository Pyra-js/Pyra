import * as esbuild from "esbuild";
import path from "node:path";

/**
 * Build client output map by correlating esbuild metafile back to routes.
 * Returns routeId → { entry, chunks, css }.
 */
export function buildClientOutputMap(
  meta: esbuild.Metafile,
  clientEntryMap: Map<string, string>,
  clientOutDir: string,
  root: string,
): Map<string, { entry: string; chunks: string[]; css: string[] }> {
  // Invert entry map: normalized entry file path → routeId
  const pathToRouteId = new Map<string, string>();
  for (const [routeId, entryPath] of clientEntryMap) {
    const normalized = path.relative(root, entryPath).split(path.sep).join("/");
    pathToRouteId.set(normalized, routeId);
  }

  const result = new Map<
    string,
    { entry: string; chunks: string[]; css: string[] }
  >();

  for (const [outputPath, outputMeta] of Object.entries(meta.outputs)) {
    if (!outputMeta.entryPoint) continue;

    const routeId = pathToRouteId.get(outputMeta.entryPoint);
    if (!routeId) continue;

    // Path relative to dist/client/ (parent of assets/)
    const clientDir = path.dirname(clientOutDir);
    const relativeEntry = path
      .relative(clientDir, path.resolve(root, outputPath))
      .split(path.sep)
      .join("/");

    // Collect CSS
    const css: string[] = [];
    if (outputMeta.cssBundle) {
      const cssRel = path
        .relative(clientDir, path.resolve(root, outputMeta.cssBundle))
        .split(path.sep)
        .join("/");
      css.push(cssRel);
    }

    // Collect shared chunk imports
    const chunks: string[] = [];
    for (const imp of outputMeta.imports || []) {
      if (imp.kind === "import-statement" && !imp.external) {
        const chunkRel = path
          .relative(clientDir, path.resolve(root, imp.path))
          .split(path.sep)
          .join("/");
        if (chunkRel !== relativeEntry) {
          chunks.push(chunkRel);
        }
      }
    }

    result.set(routeId, { entry: relativeEntry, chunks, css });
  }

  return result;
}

/**
 * Build client output map for layout (or error boundary) files.
 * Returns id → relative client output path.
 */
export function buildClientLayoutOutputMap(
  meta: esbuild.Metafile,
  clientLayoutMap: Map<string, string>,
  clientOutDir: string,
  root: string,
): Map<string, string> {
  // Invert: normalize file path → id
  const pathToId = new Map<string, string>();
  for (const [id, filePath] of clientLayoutMap) {
    const normalized = path.relative(root, filePath).split(path.sep).join("/");
    pathToId.set(normalized, id);
  }

  const result = new Map<string, string>();
  const clientDir = path.dirname(clientOutDir); // dist/client/

  for (const [outputPath, outputMeta] of Object.entries(meta.outputs)) {
    if (!outputMeta.entryPoint) continue;
    const id = pathToId.get(outputMeta.entryPoint);
    if (!id) continue;

    const relativePath = path
      .relative(clientDir, path.resolve(root, outputPath))
      .split(path.sep)
      .join("/");
    result.set(id, relativePath);
  }

  return result;
}
