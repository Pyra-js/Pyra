import type { ManifestRouteEntry } from "pyrajs-shared";

/**
 * Generate <link> and <script> tags for a prerendered page's
 * manifest-declared assets.
 */
export function buildPrerenderAssetTags(
  entry: ManifestRouteEntry,
  base: string,
): { head: string; body: string } {
  const headParts: string[] = [];

  for (const css of entry.css || []) {
    headParts.push(`<link rel="stylesheet" href="${base}${css}">`);
  }
  for (const chunk of entry.clientChunks || []) {
    headParts.push(`<link rel="modulepreload" href="${base}${chunk}">`);
  }
  if (entry.clientEntry) {
    headParts.push(
      `<link rel="modulepreload" href="${base}${entry.clientEntry}">`,
    );
  }

  return { head: headParts.join("\n  "), body: "" };
}
