/**
 * Core dependency graph builder
 */

import type {
  DependencyGraph,
  GraphNode,
  GraphEdge,
  WorkspaceInfo,
  DependencyType,
} from './types.js';
import { detectWorkspaces } from './detectWorkspaces.js';
import { detectPM } from '../pm.js';

export interface BuildGraphOptions {
  rootPath: string;
  packageManager?: string;
}

/**
 * Build dependency graph from workspace
 */
export async function buildGraph(options: BuildGraphOptions): Promise<DependencyGraph> {
  const { rootPath, packageManager: pmOverride } = options;

  // Detect package manager
  const pm = pmOverride || (await detectPM(rootPath)).name;

  // Detect workspaces
  const workspaces = detectWorkspaces(rootPath);

  // Build nodes and edges
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const externalDeps = new Map<string, GraphNode>();

  // Create internal nodes from workspace packages
  const internalPackages = new Set<string>();

  for (const workspace of workspaces) {
    const node: GraphNode = {
      id: workspace.name,
      label: workspace.name,
      type: 'internal',
      version: workspace.packageJson.version,
      workspace: workspace.path.replace(rootPath, '').replace(/^[/\\]/, '') || '.',
      path: workspace.path,
      description: workspace.packageJson.description,
      private: workspace.packageJson.private,
    };

    nodes.push(node);
    internalPackages.add(workspace.name);
  }

  // Create edges from dependencies
  for (const workspace of workspaces) {
    const { packageJson } = workspace;

    // Process each dependency type
    const depTypes: Array<{
      deps: Record<string, string>;
      type: DependencyType;
    }> = [
      { deps: packageJson.dependencies || {}, type: 'prod' },
      { deps: packageJson.devDependencies || {}, type: 'dev' },
      { deps: packageJson.peerDependencies || {}, type: 'peer' },
      { deps: packageJson.optionalDependencies || {}, type: 'optional' },
    ];

    for (const { deps, type } of depTypes) {
      for (const [depName, versionRange] of Object.entries(deps)) {
        // Create edge
        const edge: GraphEdge = {
          from: workspace.name,
          to: depName,
          type,
          versionRange,
        };

        edges.push(edge);

        // If external dependency, create external node
        if (!internalPackages.has(depName) && !externalDeps.has(depName)) {
          const externalNode: GraphNode = {
            id: depName,
            label: depName,
            type: 'external',
          };

          externalDeps.set(depName, externalNode);
        }
      }
    }
  }

  // Add external nodes
  nodes.push(...externalDeps.values());

  return {
    nodes,
    edges,
    workspaces: workspaces.map(w => w.name),
    root: rootPath,
    packageManager: pm,
  };
}

/**
 * Detect cycles in dependency graph using DFS
 */
export function detectCycles(graph: DependencyGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  // Build adjacency list
  const adjacencyList = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!adjacencyList.has(edge.from)) {
      adjacencyList.set(edge.from, []);
    }
    adjacencyList.get(edge.from)!.push(edge.to);
  }

  function dfs(node: string): void {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = adjacencyList.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart);
          cycle.push(neighbor); // Complete the cycle
          cycles.push(cycle);
        }
      }
    }

    path.pop();
    recursionStack.delete(node);
  }

  // Check all nodes
  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return cycles;
}

/**
 * Mark circular edges in the graph
 */
export function markCycles(graph: DependencyGraph): void {
  const cycles = detectCycles(graph);

  if (cycles.length === 0) return;

  // Build set of circular edges
  const circularEdges = new Set<string>();

  for (const cycle of cycles) {
    for (let i = 0; i < cycle.length - 1; i++) {
      const from = cycle[i];
      const to = cycle[i + 1];
      circularEdges.add(`${from}->${to}`);
    }
  }

  // Mark edges
  for (const edge of graph.edges) {
    const key = `${edge.from}->${edge.to}`;
    if (circularEdges.has(key)) {
      edge.circular = true;
    }
  }
}

/**
 * Apply filters to graph
 */
export function filterGraph(
  graph: DependencyGraph,
  options: {
    internalOnly?: boolean;
    externalOnly?: boolean;
    hideDev?: boolean;
    hidePeer?: boolean;
    hideOptional?: boolean;
    filter?: string;
    maxDepth?: number;
  }
): DependencyGraph {
  let filteredNodes = [...graph.nodes];
  let filteredEdges = [...graph.edges];

  // Filter by node type
  if (options.internalOnly) {
    filteredNodes = filteredNodes.filter(n => n.type === 'internal');
  } else if (options.externalOnly) {
    filteredNodes = filteredNodes.filter(n => n.type === 'external');
  }

  // Filter by dependency type
  if (options.hideDev) {
    filteredEdges = filteredEdges.filter(e => e.type !== 'dev');
  }
  if (options.hidePeer) {
    filteredEdges = filteredEdges.filter(e => e.type !== 'peer');
  }
  if (options.hideOptional) {
    filteredEdges = filteredEdges.filter(e => e.type !== 'optional');
  }

  // Filter by pattern
  if (options.filter) {
    const pattern = new RegExp(
      options.filter.replace(/\*/g, '.*').replace(/\?/g, '.'),
      'i'
    );
    filteredNodes = filteredNodes.filter(n => pattern.test(n.id));
  }

  // Keep only edges where both nodes exist
  const nodeIds = new Set(filteredNodes.map(n => n.id));
  filteredEdges = filteredEdges.filter(
    e => nodeIds.has(e.from) && nodeIds.has(e.to)
  );

  // Apply max depth filter
  if (options.maxDepth !== undefined) {
    const reachable = new Set<string>();
    const internalNodes = filteredNodes.filter(n => n.type === 'internal');

    // BFS from internal nodes up to maxDepth
    const queue: Array<{ node: string; depth: number }> = internalNodes.map(n => ({
      node: n.id,
      depth: 0,
    }));

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;
      if (reachable.has(node) || depth > options.maxDepth) continue;

      reachable.add(node);

      if (depth < options.maxDepth) {
        const neighbors = filteredEdges
          .filter(e => e.from === node)
          .map(e => ({ node: e.to, depth: depth + 1 }));
        queue.push(...neighbors);
      }
    }

    filteredNodes = filteredNodes.filter(n => reachable.has(n.id));
    filteredEdges = filteredEdges.filter(
      e => reachable.has(e.from) && reachable.has(e.to)
    );
  }

  return {
    ...graph,
    nodes: filteredNodes,
    edges: filteredEdges,
  };
}
