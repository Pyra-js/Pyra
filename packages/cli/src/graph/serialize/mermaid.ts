/**
 * Mermaid diagram serializer
 */

import type { DependencyGraph, DependencyType } from '../types.js';

/**
 * Serialize graph to Mermaid format
 */
export function serializeMermaid(graph: DependencyGraph): string {
  const lines: string[] = ['graph LR'];

  // Add nodes with styling
  for (const node of graph.nodes) {
    const nodeId = sanitizeId(node.id);
    const label = node.label;

    if (node.type === 'internal') {
      // Internal nodes as rectangles
      lines.push(`  ${nodeId}["${label}"]`);
      lines.push(`  class ${nodeId} internal`);
    } else {
      // External nodes as rounded rectangles
      lines.push(`  ${nodeId}("${label}")`);
      lines.push(`  class ${nodeId} external`);
    }
  }

  // Add edges
  for (const edge of graph.edges) {
    const fromId = sanitizeId(edge.from);
    const toId = sanitizeId(edge.to);
    const edgeStyle = getEdgeStyle(edge.type);
    const label = getEdgeLabel(edge.type, edge.circular);

    if (edge.circular) {
      lines.push(`  ${fromId} ${edgeStyle}|${label}| ${toId}`);
      lines.push(`  linkStyle ${graph.edges.indexOf(edge)} stroke:red`);
    } else {
      lines.push(`  ${fromId} ${edgeStyle}|${label}| ${toId}`);
    }
  }

  // Add styling
  lines.push('');
  lines.push('  classDef internal fill:#e1f5fe,stroke:#01579b,stroke-width:2px');
  lines.push('  classDef external fill:#f3e5f5,stroke:#4a148c,stroke-width:1px');

  return lines.join('\n');
}

function sanitizeId(id: string): string {
  // Replace characters that Mermaid doesn't like
  return id.replace(/[@/\-\.]/g, '_');
}

function getEdgeStyle(type: DependencyType): string {
  switch (type) {
    case 'prod':
      return '-->'; // Solid arrow
    case 'dev':
      return '-.->'; // Dotted arrow
    case 'peer':
      return '==>'; // Thick arrow
    case 'optional':
      return '-.-'; // Dotted line
    default:
      return '-->';
  }
}

function getEdgeLabel(type: DependencyType, circular?: boolean): string {
  const typeLabel = type === 'prod' ? '' : type;
  const circularLabel = circular ? '🔄' : '';
  return [circularLabel, typeLabel].filter(Boolean).join(' ');
}
