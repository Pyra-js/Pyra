/**
 * Graph types for dependency visualization
 */

export type DependencyType = 'prod' | 'dev' | 'peer' | 'optional';
export type NodeType = 'internal' | 'external';
export type OutputFormat = 'html' | 'svg' | 'png' | 'mermaid' | 'dot' | 'json';

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  version?: string;
  workspace?: string;
  path?: string;
  description?: string;
  private?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: DependencyType;
  versionRange: string;
  resolvedVersion?: string;
  circular?: boolean;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  workspaces: string[];
  root: string;
  packageManager: string;
}

export interface GraphOptions {
  path?: string;
  open?: boolean;
  format?: OutputFormat;
  outfile?: string;
  internalOnly?: boolean;
  externalOnly?: boolean;
  filter?: string;
  hideDev?: boolean;
  hidePeer?: boolean;
  hideOptional?: boolean;
  maxDepth?: number;
  cycles?: boolean;
  stats?: boolean;
  pm?: string;
  json?: boolean;
  silent?: boolean;
}

export interface WorkspaceInfo {
  name: string;
  path: string;
  packageJson: PackageJsonInfo;
}

export interface PackageJsonInfo {
  name: string;
  version: string;
  description?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export interface LockfileInfo {
  type: 'pnpm' | 'yarn' | 'npm' | 'bun' | 'none';
  path?: string;
  resolvedVersions: Map<string, string>;
}

export interface GraphStats {
  totalNodes: number;
  internalNodes: number;
  externalNodes: number;
  totalEdges: number;
  cycles: string[][];
  maxDepth: number;
}
