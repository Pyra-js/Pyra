/**
 * Convert a route ID to a safe filename.
 * '/' → '_index', '/blog/[slug]' → 'blog__slug_'
 */
export function routeIdToSafeName(routeId: string): string {
  if (routeId === "/") return "_index";
  return routeId
    .slice(1)
    .replace(/\[/g, "")
    .replace(/\]/g, "_")
    .replace(/\.\.\./g, "_rest")
    .replace(/\//g, "__");
}

/**
 * Get all ancestor directory IDs from root to the given route ID.
 * '/blog/[slug]' → ['/', '/blog', '/blog/[slug]']
 */
export function getAncestorDirIds(routeId: string): string[] {
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
