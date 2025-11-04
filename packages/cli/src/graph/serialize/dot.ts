/**
 * DOT (Graphviz) serializer
 */

import type { DependencyGraph, DependencyType } from '../types.js';

/**
 * Serialize graph to DOT format
 */
export function serializeDot(graph: DependencyGraph): string {
  const lines: string[] = [
    'digraph dependencies {',
    '  rankdir=LR;',
    '  node [shape=box, style=rounded];',
    '',
  ];

  // Group internal nodes by workspace
  const workspaceNodes = new Map<string, string[]>();

  for (const node of graph.nodes) {
    if (node.type === 'internal' && node.workspace) {
      if (!workspaceNodes.has(node.workspace)) {
        workspaceNodes.set(node.workspace, []);
      }
      workspaceNodes.get(node.workspace)!.push(node.id);
    }
  }

  // Add subgraphs for workspaces
  let clusterIndex = 0;
  for (const [workspace, nodeIds] of workspaceNodes.entries()) {
    lines.push(`  subgraph cluster_${clusterIndex} {`);
    lines.push(`    label="${workspace}";`);
    lines.push('    style=filled;');
    lines.push('    color=lightblue;');
    lines.push('');

    for (const nodeId of nodeIds) {
      const node = graph.nodes.find(n => n.id === nodeId)!;
      const label = escapeLabel(node.label);
      const version = node.version ? `\\n${node.version}` : '';
      lines.push(`    "${nodeId}" [label="${label}${version}"];`);
    }

    lines.push('  }');
    lines.push('');
    clusterIndex++;
  }

  // Add external nodes
  for (const node of graph.nodes) {
    if (node.type === 'external') {
      const label = escapeLabel(node.label);
      const version = node.version ? `\\n${node.version}` : '';
      lines.push(`  "${node.id}" [label="${label}${version}", shape=ellipse, color=purple];`);
    }
  }

  lines.push('');

  // Add edges
  for (const edge of graph.edges) {
    const style = getEdgeStyle(edge.type);
    const color = edge.circular ? 'red' : getEdgeColor(edge.type);
    const label = getEdgeLabel(edge.type, edge.versionRange, edge.circular);

    lines.push(
      `  "${edge.from}" -> "${edge.to}" [${style}, color=${color}, label="${label}"];`
    );
  }

  lines.push('}');

  return lines.join('\n');
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, '\\"');
}

function getEdgeStyle(type: DependencyType): string {
  switch (type) {
    case 'prod':
      return 'style=solid';
    case 'dev':
      return 'style=dashed';
    case 'peer':
      return 'style=bold';
    case 'optional':
      return 'style=dotted';
    default:
      return 'style=solid';
  }
}

function getEdgeColor(type: DependencyType): string {
  switch (type) {
    case 'prod':
      return 'black';
    case 'dev':
      return 'gray';
    case 'peer':
      return 'blue';
    case 'optional':
      return 'orange';
    default:
      return 'black';
  }
}

function getEdgeLabel(
  type: DependencyType,
  versionRange: string,
  circular?: boolean
): string {
  const parts: string[] = [];

  if (circular) {
    parts.push('⟲');
  }

  if (type !== 'prod') {
    parts.push(type);
  }

  parts.push(versionRange);

  return parts.join(' ');
}
