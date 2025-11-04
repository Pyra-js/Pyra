/**
 * CLI Build Dashboard
 *
 * Pretty terminal output for build metrics
 */

import { log } from 'pyrajs-shared';
import type { FileMetric, BuildMetrics } from 'pyrajs-core';

/**
 * Format bytes to human-readable size
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

/**
 * Format time with color based on duration
 */
function formatTime(ms: number): string {
  if (ms < 10) return `\x1b[32m${ms.toFixed(1)}ms\x1b[0m`; // Green (fast)
  if (ms < 50) return `\x1b[33m${ms.toFixed(1)}ms\x1b[0m`; // Yellow (medium)
  return `\x1b[31m${ms.toFixed(1)}ms\x1b[0m`; // Red (slow)
}

/**
 * Create a simple progress bar
 */
function progressBar(value: number, max: number, width = 20): string {
  const percentage = Math.min(value / max, 1);
  const filled = Math.round(percentage * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percent = (percentage * 100).toFixed(0);

  return `${bar} ${percent}%`;
}

/**
 * Print build start banner
 */
export function printBuildStart(): void {
  console.log('');
  log.info('🔨  Compiling...');
}

/**
 * Print file compilation result
 */
export function printFileCompiled(file: FileMetric): void {
  const icon = '📦';
  const fileName = file.path.padEnd(25, ' ');
  const time = formatTime(file.compileTime);
  const size = formatSize(file.size).padStart(8, ' ');

  console.log(`  ${icon}  ${fileName}  ${time.padEnd(20, ' ')}  ${size}`);
}

/**
 * Print build completion summary
 */
export function printBuildComplete(metrics: BuildMetrics): void {
  console.log('');

  const totalTime = metrics.totalDuration;
  const fileCount = metrics.files.length;
  const bundleSize = formatSize(metrics.bundleSize);

  // Success message
  log.success(`✅  Build complete in ${formatTime(totalTime)}`);

  // Summary stats
  console.log('');
  console.log(`   Files:        ${fileCount}`);
  console.log(`   Bundle size:  ${bundleSize}`);
  console.log(`   Total time:   ${totalTime.toFixed(0)}ms`);

  // Top 5 slowest files
  if (metrics.files.length > 0) {
    console.log('');
    console.log('   Slowest files:');

    const slowest = [...metrics.files]
      .sort((a, b) => b.compileTime - a.compileTime)
      .slice(0, 5);

    slowest.forEach((file, index) => {
      const maxTime = slowest[0].compileTime;
      const bar = progressBar(file.compileTime, maxTime, 15);
      console.log(`     ${index + 1}. ${file.path.padEnd(30, ' ')} ${formatTime(file.compileTime).padEnd(20, ' ')} ${bar}`);
    });
  }

  console.log('');
}

/**
 * Print dashboard info message
 */
export function printDashboardInfo(port: number): void {
  console.log('');
  log.info(`📊  Dashboard: \x1b[36mhttp://localhost:${port}/_pyra\x1b[0m`);
  console.log('');
}

/**
 * Print live build summary (compact version for terminal)
 */
export function printLiveBuildSummary(metrics: BuildMetrics): void {
  const files = metrics.files;
  const avgTime = files.length > 0
    ? files.reduce((sum, f) => sum + f.compileTime, 0) / files.length
    : 0;

  console.log('');
  console.log('╭─────────────────────────────────────────╮');
  console.log('│  🔥  Live Build Stats                   │');
  console.log('├─────────────────────────────────────────┤');
  console.log(`│  Files compiled:    ${String(files.length).padEnd(17, ' ')} │`);
  console.log(`│  Bundle size:       ${formatSize(metrics.bundleSize).padEnd(17, ' ')} │`);
  console.log(`│  Average time:      ${formatTime(avgTime).padEnd(17, ' ')} │`);
  console.log(`│  Total time:        ${formatTime(metrics.totalDuration).padEnd(17, ' ')} │`);
  console.log('╰─────────────────────────────────────────╯');
  console.log('');
}

/**
 * Print file change notification
 */
export function printFileChanged(file: string): void {
  console.log('');
  log.info(`🔄  File changed: \x1b[36m${file}\x1b[0m`);
  printBuildStart();
}

/**
 * Print pretty table of recent builds
 */
export function printBuildHistory(builds: BuildMetrics[], limit = 5): void {
  if (builds.length === 0) {
    console.log('No build history available');
    return;
  }

  console.log('');
  console.log('Recent Builds:');
  console.log('─'.repeat(80));

  const recentBuilds = builds.slice(-limit).reverse();

  recentBuilds.forEach((build, index) => {
    const time = new Date(build.timestamp).toLocaleTimeString();
    const duration = formatTime(build.totalDuration);
    const size = formatSize(build.bundleSize);
    const fileCount = build.files.length;

    console.log(`  ${index + 1}. ${time.padEnd(15, ' ')} ${duration.padEnd(20, ' ')} ${size.padEnd(12, ' ')} (${fileCount} files)`);
  });

  console.log('─'.repeat(80));
  console.log('');
}

/**
 * Create a simple ASCII chart for build times
 */
export function printBuildTimeChart(builds: BuildMetrics[], width = 50): void {
  if (builds.length === 0) {
    console.log('No data to display');
    return;
  }

  const maxDuration = Math.max(...builds.map(b => b.totalDuration));
  const minDuration = Math.min(...builds.map(b => b.totalDuration));

  console.log('');
  console.log('Build Time Trend:');
  console.log('');

  builds.forEach((build, index) => {
    const barLength = Math.round((build.totalDuration / maxDuration) * width);
    const bar = '█'.repeat(barLength);
    const time = formatTime(build.totalDuration);

    console.log(`  ${String(index + 1).padStart(2, ' ')}. ${bar} ${time}`);
  });

  console.log('');
  console.log(`  Min: ${formatTime(minDuration)} | Max: ${formatTime(maxDuration)} | Avg: ${formatTime(builds.reduce((sum, b) => sum + b.totalDuration, 0) / builds.length)}`);
  console.log('');
}
