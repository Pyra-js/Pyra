import type { ManifestRouteEntry } from "pyrajs-shared";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrieNode {
  staticChildren: Map<string, TrieNode>;
  dynamicChild: { paramName: string; node: TrieNode } | null;
  catchAllChild: { paramName: string; entry: ManifestRouteEntry } | null;
  entry: ManifestRouteEntry | null;
}

export interface MatchResult {
  entry: ManifestRouteEntry;
  params: Record<string, string>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTrieNode(): TrieNode {
  return {
    staticChildren: new Map(),
    dynamicChild: null,
    catchAllChild: null,
    entry: null,
  };
}

function splitSegments(value: string): string[] {
  if (value === "/") return [];
  const normalized =
    value.endsWith("/") && value !== "/" ? value.slice(0, -1) : value;
  return normalized.split("/").filter(Boolean);
}

// ─── Matcher ──────────────────────────────────────────────────────────────────

/**
 * Build a trie from manifest route entries for efficient URL matching.
 * Priority: static > dynamic > catch-all (mirrors router.ts).
 */
export function buildMatcher(
  routes: Record<string, ManifestRouteEntry>,
): { match(pathname: string): MatchResult | null } {
  const root = createTrieNode();

  // Insert each route's pattern into the trie
  for (const entry of Object.values(routes)) {
    const segments = splitSegments(entry.pattern);
    let current = root;
    let isCatchAll = false;

    for (const segment of segments) {
      if (segment.startsWith("*")) {
        // Catch-all segment — store on the current node and stop
        const paramName = segment.slice(1);
        current.catchAllChild = { paramName, entry };
        isCatchAll = true;
        break;
      } else if (segment.startsWith(":")) {
        const paramName = segment.slice(1);
        if (!current.dynamicChild) {
          current.dynamicChild = { paramName, node: createTrieNode() };
        }
        current = current.dynamicChild.node;
      } else {
        let child = current.staticChildren.get(segment);
        if (!child) {
          child = createTrieNode();
          current.staticChildren.set(segment, child);
        }
        current = child;
      }
    }

    if (!isCatchAll) {
      current.entry = entry;
    }
  }

  function matchSegments(
    node: TrieNode,
    segments: string[],
    index: number,
    params: Record<string, string>,
  ): ManifestRouteEntry | null {
    if (index === segments.length) return node.entry;

    const segment = segments[index];

    // 1. Static first (highest priority)
    const staticChild = node.staticChildren.get(segment);
    if (staticChild) {
      const result = matchSegments(staticChild, segments, index + 1, params);
      if (result) return result;
    }

    // 2. Dynamic fallback (medium priority)
    if (node.dynamicChild) {
      const { paramName, node: dynamicNode } = node.dynamicChild;
      params[paramName] = segment;
      const result = matchSegments(dynamicNode, segments, index + 1, params);
      if (result) return result;
      delete params[paramName];
    }

    // 3. Catch-all (lowest priority) — consumes all remaining segments
    if (node.catchAllChild) {
      const { paramName, entry } = node.catchAllChild;
      params[paramName] = segments.slice(index).join("/");
      return entry;
    }

    return null;
  }

  return {
    match(pathname: string): MatchResult | null {
      const segments = splitSegments(pathname);
      const params: Record<string, string> = {};
      const entry = matchSegments(root, segments, 0, params);
      if (!entry) return null;
      return { entry, params };
    },
  };
}
