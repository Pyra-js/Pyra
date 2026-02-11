/**
 * Build Metrics Collection System
 *
 * Tracks build performance, bundle sizes, plugin timings, HMR events,
 * and request traces (v0.9).
 */

import type { RequestTrace, TraceFilter, RouteStats } from 'pyrajs-shared';

export interface FileMetric {
  path: string;
  size: number;
  compileTime: number;
  timestamp: number;
}

export interface PluginMetric {
  name: string;
  duration: number;
  timestamp: number;
}

export interface HMREvent {
  type: 'reload' | 'update';
  file: string;
  timestamp: number;
  duration?: number;
}

export interface BuildMetrics {
  totalDuration: number;
  files: FileMetric[];
  plugins: PluginMetric[];
  bundleSize: number;
  timestamp: number;
}

export interface DependencyNode {
  id: string;
  path: string;
  size: number;
  dependencies: string[];
}

/**
 * Metrics Store - Singleton for collecting and accessing build metrics
 */
class MetricsStore {
  private buildHistory: BuildMetrics[] = [];
  private hmrHistory: HMREvent[] = [];
  private dependencyGraph: Map<string, DependencyNode> = new Map();
  private currentBuild: Partial<BuildMetrics> = {};
  private maxHistorySize = 50; // Keep last 50 builds

  // v0.9: Request trace storage (ring buffer)
  private traces: RequestTrace[] = [];
  private maxTraceSize = 200;

  /**
   * Start a new build measurement
   */
  startBuild(): void {
    this.currentBuild = {
      files: [],
      plugins: [],
      bundleSize: 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Add file metric to current build
   */
  addFileMetric(metric: FileMetric): void {
    if (!this.currentBuild.files) {
      this.currentBuild.files = [];
    }
    this.currentBuild.files.push(metric);
  }

  /**
   * Add plugin metric to current build
   */
  addPluginMetric(metric: PluginMetric): void {
    if (!this.currentBuild.plugins) {
      this.currentBuild.plugins = [];
    }
    this.currentBuild.plugins.push(metric);
  }

  /**
   * Finish current build and calculate total metrics
   */
  finishBuild(): BuildMetrics | null {
    if (!this.currentBuild.timestamp) {
      return null;
    }

    const totalDuration = Date.now() - this.currentBuild.timestamp;
    const bundleSize = this.currentBuild.files?.reduce((sum, f) => sum + f.size, 0) || 0;

    const build: BuildMetrics = {
      totalDuration,
      files: this.currentBuild.files || [],
      plugins: this.currentBuild.plugins || [],
      bundleSize,
      timestamp: this.currentBuild.timestamp,
    };

    // Add to history
    this.buildHistory.push(build);

    // Trim history if too long
    if (this.buildHistory.length > this.maxHistorySize) {
      this.buildHistory = this.buildHistory.slice(-this.maxHistorySize);
    }

    // Reset current build
    this.currentBuild = {};

    return build;
  }

  /**
   * Add HMR event
   */
  addHMREvent(event: HMREvent): void {
    this.hmrHistory.push(event);

    // Keep only last 100 events
    if (this.hmrHistory.length > 100) {
      this.hmrHistory = this.hmrHistory.slice(-100);
    }
  }

  /**
   * Update dependency graph
   */
  updateDependencyGraph(node: DependencyNode): void {
    this.dependencyGraph.set(node.id, node);
  }

  /**
   * Get latest build
   */
  getLatestBuild(): BuildMetrics | null {
    return this.buildHistory[this.buildHistory.length - 1] || null;
  }

  /**
   * Get build history
   */
  getBuildHistory(limit = 10): BuildMetrics[] {
    return this.buildHistory.slice(-limit);
  }

  /**
   * Get HMR history
   */
  getHMRHistory(limit = 20): HMREvent[] {
    return this.hmrHistory.slice(-limit);
  }

  /**
   * Get dependency graph
   */
  getDependencyGraph(): DependencyNode[] {
    return Array.from(this.dependencyGraph.values());
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const latest = this.getLatestBuild();
    const history = this.getBuildHistory(10);

    return {
      latestBuild: latest,
      averageBuildTime: history.length > 0
        ? history.reduce((sum, b) => sum + b.totalDuration, 0) / history.length
        : 0,
      totalBuilds: this.buildHistory.length,
      totalHMREvents: this.hmrHistory.length,
      dependencyCount: this.dependencyGraph.size,
    };
  }

  // ── v0.9: Request Trace Methods ──────────────────────────────────────────

  /**
   * Set the max trace buffer size.
   */
  setTraceBufferSize(size: number): void {
    this.maxTraceSize = size;
    if (this.traces.length > this.maxTraceSize) {
      this.traces = this.traces.slice(-this.maxTraceSize);
    }
  }

  /**
   * Push a completed trace into the store.
   */
  recordTrace(trace: RequestTrace): void {
    this.traces.push(trace);
    if (this.traces.length > this.maxTraceSize) {
      this.traces = this.traces.slice(-this.maxTraceSize);
    }
  }

  /**
   * Get traces filtered by route, status, or time range.
   */
  queryTraces(filter?: TraceFilter): RequestTrace[] {
    if (!filter) return [...this.traces];

    return this.traces.filter((t) => {
      if (filter.routeId && t.routeId !== filter.routeId) return false;
      if (filter.status !== undefined && t.status !== filter.status) return false;
      if (filter.minMs !== undefined && t.totalMs < filter.minMs) return false;
      if (filter.since !== undefined && t.timestamp < filter.since) return false;
      return true;
    });
  }

  /**
   * Get a single trace by ID.
   */
  getTrace(id: string): RequestTrace | undefined {
    return this.traces.find((t) => t.id === id);
  }

  /**
   * Get the last N traces.
   */
  getRecentTraces(limit = 50): RequestTrace[] {
    return this.traces.slice(-limit);
  }

  /**
   * Get aggregate stats: avg/p50/p95/p99 response times per route.
   */
  routeStats(): Map<string, RouteStats> {
    const byRoute = new Map<string, number[]>();

    for (const trace of this.traces) {
      if (!trace.routeId) continue;
      let times = byRoute.get(trace.routeId);
      if (!times) {
        times = [];
        byRoute.set(trace.routeId, times);
      }
      times.push(trace.totalMs);
    }

    const result = new Map<string, RouteStats>();

    for (const [routeId, times] of byRoute) {
      const sorted = [...times].sort((a, b) => a - b);
      const count = sorted.length;
      const avg = sorted.reduce((s, v) => s + v, 0) / count;

      result.set(routeId, {
        routeId,
        count,
        avgMs: round(avg),
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        p99Ms: percentile(sorted, 99),
        lastMs: sorted[sorted.length - 1],
      });
    }

    return result;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.buildHistory = [];
    this.hmrHistory = [];
    this.dependencyGraph.clear();
    this.currentBuild = {};
    this.traces = [];
  }
}

/** Round to 1 decimal place. */
function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Calculate a percentile from a sorted array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// Export singleton instance
export const metricsStore = new MetricsStore();

/**
 * Utility to measure async function execution time
 */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  onComplete?: (duration: number) => void
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    if (onComplete) {
      onComplete(duration);
    }
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    if (onComplete) {
      onComplete(duration);
    }
    throw error;
  }
}

/**
 * Utility to measure sync function execution time
 */
export function measureSync<T>(
  name: string,
  fn: () => T,
  onComplete?: (duration: number) => void
): T {
  const start = Date.now();
  try {
    const result = fn();
    const duration = Date.now() - start;
    if (onComplete) {
      onComplete(duration);
    }
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    if (onComplete) {
      onComplete(duration);
    }
    throw error;
  }
}
