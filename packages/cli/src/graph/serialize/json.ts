/**
 * JSON serializer for dependency graph
 */

import type { DependencyGraph } from '../types.js';

/**
 * Serialize graph to JSON
 */
export function serializeJson(graph: DependencyGraph): string {
  return JSON.stringify(graph, null, 2);
}
