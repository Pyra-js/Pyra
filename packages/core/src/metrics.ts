/**
 * Build Metrics Collection System
 *
 * Tracks build performance, bundle sizes, plugin timings, and HMR events
 */

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

  /**
   * Clear all metrics
   */
  clear(): void {
    this.buildHistory = [];
    this.hmrHistory = [];
    this.dependencyGraph.clear();
    this.currentBuild = {};
  }
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
