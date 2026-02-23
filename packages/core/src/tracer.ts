/**
 * Request Tracer (v0.9 — Transparency Layer)
 *
 * Collects timing data as a request moves through each pipeline stage.
 * Produces Server-Timing headers, structured terminal logs, and
 * RequestTrace objects for the metrics store.
 */

import pc from 'picocolors';
import type { RequestTrace, TraceStage } from 'pyrajs-shared';

let traceIdCounter = 0;

/** Reset the counter (useful for tests). */
export function resetTraceIdCounter(): void {
  traceIdCounter = 0;
}

export class RequestTracer {
  private readonly id: string;
  private readonly method: string;
  private readonly pathname: string;
  private readonly timestamp: number;
  private readonly stages: TraceStage[] = [];
  private activeStage: { name: string; start: number; detail?: string } | null = null;
  private traceError?: string;

  constructor(method: string, pathname: string) {
    this.id = `req-${++traceIdCounter}`;
    this.method = method;
    this.pathname = pathname;
    this.timestamp = Date.now();
  }

  /**
   * Mark the start of a named stage.
   * Auto-closes any previously open stage (defensive).
   */
  start(name: string, detail?: string): void {
    if (this.activeStage) {
      this.end();
    }
    this.activeStage = { name, start: performance.now(), detail };
  }

  /**
   * Annotate the most recently closed stage with a detail string.
   * Call this after end() to attach data that wasn't available at start() time.
   */
  setDetail(detail: string): void {
    if (this.stages.length > 0) {
      this.stages[this.stages.length - 1].detail = detail;
    }
  }

  /** Mark the end of the most recently started stage. */
  end(): void {
    if (!this.activeStage) return;
    this.stages.push({
      name: this.activeStage.name,
      durationMs: round(performance.now() - this.activeStage.start),
      detail: this.activeStage.detail,
    });
    this.activeStage = null;
  }

  /**
   * End the current stage and mark it as errored.
   */
  endWithError(errorMessage: string): void {
    if (!this.activeStage) return;
    this.stages.push({
      name: this.activeStage.name,
      durationMs: round(performance.now() - this.activeStage.start),
      detail: this.activeStage.detail,
      error: errorMessage,
    });
    this.activeStage = null;
    this.traceError = errorMessage;
  }

  /** Finalize the trace and return the completed RequestTrace. */
  finalize(status: number): RequestTrace {
    if (this.activeStage) this.end();

    const totalMs = this.stages.reduce((sum, s) => sum + s.durationMs, 0);

    return {
      id: this.id,
      method: this.method,
      pathname: this.pathname,
      routeId: this.extractRouteId(),
      routeType: this.extractRouteType(),
      stages: [...this.stages],
      totalMs: round(totalMs),
      status,
      timestamp: this.timestamp,
      error: this.traceError,
    };
  }

  /**
   * Format the trace as a Server-Timing header value.
   * Chrome DevTools Network panel renders this natively.
   */
  toServerTiming(): string {
    return this.stages
      .map((s) => {
        const name = sanitizeTimingName(s.name);
        let entry = `${name};dur=${s.durationMs}`;
        if (s.detail) entry += `;desc="${s.detail}"`;
        return entry;
      })
      .join(', ');
  }

  /**
   * Format the trace as a compact terminal log line.
   */
  toLogLine(status: number): string {
    const statusColor =
      status >= 500 ? pc.red
        : status >= 400 ? pc.yellow
          : status >= 300 ? pc.cyan
            : pc.green;

    const method = pc.bold(pc.white(this.method.padEnd(7)));
    const path = this.pathname;
    const statusStr = statusColor(String(status));
    const totalMs = this.stages.reduce((sum, s) => sum + s.durationMs, 0);
    const total = pc.dim(`${round(totalMs)}ms`);

    const breakdown = this.stages
      .filter((s) => s.durationMs >= 0.1)
      .map((s) => `${s.name}:${s.durationMs}ms`)
      .join(' ');

    return `  ${method} ${path} ${statusStr} ${total} ${pc.dim(`(${breakdown})`)}`;
  }

  /**
   * Format the trace as a multi-line tree for detailed terminal output.
   */
  toDetailedLog(status: number): string {
    const statusColor =
      status >= 500 ? pc.red
        : status >= 400 ? pc.yellow
          : status >= 300 ? pc.cyan
            : pc.green;

    const method = pc.bold(pc.white(this.method.padEnd(7)));
    const totalMs = this.stages.reduce((sum, s) => sum + s.durationMs, 0);
    const roundedTotal = round(totalMs);

    const header = `  ${method} ${this.pathname} ${statusColor(String(status))} ${pc.dim(`${roundedTotal}ms`)}`;

    if (this.stages.length === 0) return header;

    const lines: string[] = [header];

    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i];
      const isLast = i === this.stages.length - 1;
      const connector = isLast ? '\u2514\u2500' : '\u251C\u2500';

      const nameCol = stage.name.padEnd(18);
      const durationStr = `${stage.durationMs}ms`.padStart(8);

      // Highlight bottlenecks
      let duration: string;
      const ratio = roundedTotal > 0 ? stage.durationMs / roundedTotal : 0;
      if (stage.error) {
        duration = pc.red(`${durationStr}  \u2717 ${stage.error}`);
      } else if (ratio > 0.8) {
        duration = pc.red(durationStr);
      } else if (ratio > 0.5) {
        duration = pc.yellow(durationStr);
      } else {
        duration = pc.dim(durationStr);
      }

      const detail = stage.detail && !stage.error ? `  ${pc.dim(stage.detail)}` : '';

      lines.push(`    ${connector} ${nameCol} ${duration}${detail}`);
    }

    return lines.join('\n');
  }

  private extractRouteId(): string | null {
    const match = this.stages.find((s) => s.name === 'route-match');
    return match?.detail ?? null;
  }

  private extractRouteType(): 'page' | 'api' | 'static' | null {
    if (this.stages.some((s) => s.name === 'render')) return 'page';
    if (this.stages.some((s) => s.name === 'handler')) return 'api';
    if (this.stages.some((s) => s.name === 'static')) return 'static';
    return null;
  }
}

/** Round to 1 decimal place. */
function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Server-Timing metric names must be tokens (no spaces, no special chars). */
function sanitizeTimingName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Determine whether a request should be traced.
 */
export function shouldTrace(
  req: { headers: { get?: (name: string) => string | null; [key: string]: any } },
  traceConfig: { production?: 'off' | 'header' | 'on' } | undefined,
  mode: 'development' | 'production',
): boolean {
  if (mode === 'development') return true;

  const prodTrace = traceConfig?.production ?? 'off';
  if (prodTrace === 'on') return true;
  if (prodTrace === 'header') {
    // Support both Web Request.headers.get() and Node IncomingMessage.headers
    if (typeof req.headers.get === 'function') {
      return req.headers.get('x-pyra-trace') === '1';
    }
    // Node IncomingMessage headers are lowercase key-value
    return (req.headers as Record<string, string | string[] | undefined>)['x-pyra-trace'] === '1';
  }
  return false;
}
