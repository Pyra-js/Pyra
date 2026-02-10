import type { RouteNode, RouteMatch, RouteGraph, SerializedRouteGraph } from 'pyrajs-shared';
import type { ScanResult, ScannedLayout } from './scanner.js';

// Trie internals 

/**
 * A node in the URL-matching trie.
 *
 * Each TrieNode represents one segment in a URL path.
 * Children are split into two maps:
 *   - staticChildren: exact segment matches (e.g., "blog", "about")
 *   - dynamicChild: matches any single segment (the `:param` slot)
 *
 * Priority: static match is always checked before dynamic.
 * This means /blog/featured (static) beats /blog/:slug (dynamic).
 */
interface TrieNode {
  /** Static children keyed by exact segment string. */
  staticChildren: Map<string, TrieNode>;

  /** At most one dynamic child (a `:param` segment). */
  dynamicChild: { paramName: string; node: TrieNode } | null;

  /** At most one catch-all child (a `*param` segment). Matches all remaining segments. */
  catchAllChild: { paramName: string; route: RouteNode } | null;

  /** If this node is a terminal, the route it maps to. */
  route: RouteNode | null;
}

function createTrieNode(): TrieNode {
  return {
    staticChildren: new Map(),
    dynamicChild: null,
    catchAllChild: null,
    route: null,
  };
}

// ─── Router implementation ────────────────────────────────────────────────────

/**
 * The Router class implements the RouteGraph interface.
 *
 * It holds a flat map of all routes plus a trie for efficient URL matching.
 * The trie is built once from the scan result and is immutable thereafter.
 */
class Router implements RouteGraph {
  readonly nodes: ReadonlyMap<string, RouteNode>;
  private readonly root: TrieNode;
  private readonly layoutNodes: Map<string, RouteNode>;

  constructor(
    routes: RouteNode[],
    layouts: ScannedLayout[],
  ) {
    // Build the flat node map
    const nodeMap = new Map<string, RouteNode>();
    for (const route of routes) {
      nodeMap.set(route.id, route);
    }
    this.nodes = nodeMap;

    // Store layout info for building layout chains during match.
    // Layouts aren't routes themselves but we create lightweight RouteNode-like
    // entries so we can return them in RouteMatch.layouts.
    this.layoutNodes = new Map();
    for (const layout of layouts) {
      // Create a pseudo-RouteNode for the layout
      this.layoutNodes.set(layout.id, {
        id: layout.id,
        pattern: layout.id,
        filePath: layout.filePath,
        type: 'page', // layouts are page-type (they wrap pages)
        params: [],
        catchAll: false,
        middlewarePaths: [],
        children: [],
      });
    }

    // Build the trie from all routes
    this.root = createTrieNode();
    for (const route of routes) {
      this.insertRoute(route);
    }
  }

  /**
   * Insert a route into the trie.
   *
   * The pattern is split into segments. Each segment is either:
   *   - static (e.g., "blog") → goes into staticChildren
   *   - dynamic (e.g., ":slug") → goes into dynamicChild
   */
  private insertRoute(route: RouteNode): void {
    const segments = splitPattern(route.pattern);
    let current = this.root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      if (segment.startsWith('*')) {
        // Catch-all segment — must be the last segment
        const paramName = segment.slice(1);
        if (current.catchAllChild) {
          throw new Error(
            `Route collision: "${route.id}" and "${current.catchAllChild.route.id}" both define a catch-all at the same level.`,
          );
        }
        current.catchAllChild = { paramName, route };
        return; // Catch-all is always terminal
      } else if (segment.startsWith(':')) {
        // Dynamic segment
        const paramName = segment.slice(1);
        if (!current.dynamicChild) {
          current.dynamicChild = {
            paramName,
            node: createTrieNode(),
          };
        }
        current = current.dynamicChild.node;
      } else {
        // Static segment
        let child = current.staticChildren.get(segment);
        if (!child) {
          child = createTrieNode();
          current.staticChildren.set(segment, child);
        }
        current = child;
      }
    }

    // Mark terminal node
    if (current.route) {
      throw new Error(
        `Route collision: "${route.id}" and "${current.route.id}" both resolve to pattern "${route.pattern}".`,
      );
    }
    current.route = route;
  }

  /**
   * Match a URL pathname to a route.
   *
   * Walks the trie segment-by-segment. At each level:
   *   1. Try static match first (exact segment)
   *   2. Fall back to dynamic match (any segment, captures param)
   *
   * Returns null if no route matches.
   */
  match(pathname: string): RouteMatch | null {
    const segments = splitPathname(pathname);
    const params: Record<string, string> = {};

    const matched = this.matchSegments(this.root, segments, 0, params);
    if (!matched) return null;

    // Build the layout chain for this route
    const layouts = this.buildLayoutChain(matched);

    return { route: matched, params, layouts };
  }

  /**
   * Recursive trie traversal with backtracking.
   *
   * Tries static match first, then dynamic. This naturally gives
   * static routes priority over dynamic ones.
   */
  private matchSegments(
    node: TrieNode,
    segments: string[],
    index: number,
    params: Record<string, string>,
  ): RouteNode | null {
    // We've consumed all segments — check if this node is terminal
    if (index === segments.length) {
      return node.route;
    }

    const segment = segments[index];

    // 1. Try static match first (highest priority)
    const staticChild = node.staticChildren.get(segment);
    if (staticChild) {
      const result = this.matchSegments(staticChild, segments, index + 1, params);
      if (result) return result;
    }

    // 2. Try dynamic match (medium priority)
    if (node.dynamicChild) {
      const { paramName, node: dynamicNode } = node.dynamicChild;
      params[paramName] = segment;
      const result = this.matchSegments(dynamicNode, segments, index + 1, params);
      if (result) return result;
      // Backtrack: remove the param if dynamic didn't lead to a match
      delete params[paramName];
    }

    // 3. Try catch-all match (lowest priority) — consumes all remaining segments
    if (node.catchAllChild) {
      const { paramName, route } = node.catchAllChild;
      params[paramName] = segments.slice(index).join('/');
      return route;
    }

    return null;
  }

  /**
   * Build the layout chain for a matched route.
   * Walk up from the route's directory toward root, collecting layouts outermost first.
   */
  private buildLayoutChain(route: RouteNode): RouteNode[] {
    const chain: RouteNode[] = [];
    const ancestorDirs = getAncestorDirIds(route.id);

    // Collect layouts from outermost (root) to innermost
    for (const dirId of ancestorDirs) {
      const layout = this.layoutNodes.get(dirId);
      if (layout) {
        chain.push(layout);
      }
    }

    return chain;
  }

  get(id: string): RouteNode | undefined {
    return this.nodes.get(id);
  }

  pageRoutes(): RouteNode[] {
    return [...this.nodes.values()].filter(r => r.type === 'page');
  }

  apiRoutes(): RouteNode[] {
    return [...this.nodes.values()].filter(r => r.type === 'api');
  }

  toJSON(): SerializedRouteGraph {
    const routes: SerializedRouteGraph['routes'] = {};
    for (const [id, node] of this.nodes) {
      routes[id] = {
        id: node.id,
        pattern: node.pattern,
        filePath: node.filePath,
        type: node.type,
        params: node.params,
        catchAll: node.catchAll,
        layoutId: node.layoutId,
        middlewarePaths: node.middlewarePaths,
        children: node.children,
      };
    }
    return { routes };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Split a URL pattern into segments.
 * '/blog/:slug' → ['blog', ':slug']
 * '/' → [] (root route has no segments)
 */
function splitPattern(pattern: string): string[] {
  if (pattern === '/') return [];
  return pattern.split('/').filter(Boolean);
}

/**
 * Split a URL pathname into segments for matching.
 * '/blog/hello-world' → ['blog', 'hello-world']
 * '/' → []
 */
function splitPathname(pathname: string): string[] {
  if (pathname === '/') return [];
  // Remove trailing slash for matching consistency
  const normalized = pathname.endsWith('/') && pathname !== '/'
    ? pathname.slice(0, -1)
    : pathname;
  return normalized.split('/').filter(Boolean);
}

/**
 * Get all ancestor directory IDs from root to the given route ID.
 * '/blog/[slug]' → ['/', '/blog', '/blog/[slug]']
 */
function getAncestorDirIds(routeId: string): string[] {
  if (routeId === '/') return ['/'];

  const segments = routeId.split('/').filter(Boolean);
  const ancestors: string[] = ['/'];
  let current = '';
  for (const seg of segments) {
    current += '/' + seg;
    ancestors.push(current);
  }
  return ancestors;
}

// ─── Factory function ─────────────────────────────────────────────────────────

/**
 * Create a RouteGraph from scan results.
 *
 * This is the main entry point. Call scanRoutes() to get a ScanResult,
 * then pass it here to build the trie-based router.
 *
 * @example
 * ```ts
 * import { scanRoutes, createRouter } from 'pyrajs-core';
 *
 * const scanResult = await scanRoutes('src/routes', ['.tsx', '.jsx']);
 * const router = createRouter(scanResult);
 *
 * const match = router.match('/blog/hello-world');
 * // match.route.id === '/blog/[slug]'
 * // match.params === { slug: 'hello-world' }
 * ```
 */
export function createRouter(scanResult: ScanResult): RouteGraph {
  return new Router(scanResult.routes, scanResult.layouts);
}
