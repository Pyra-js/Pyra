import {
  type PyraConfig,
  type PyraAdapter,
  type RouteManifest,
} from "pyrajs-shared";

// Public API
export interface BuildOrchestratorOptions {
  config: PyraConfig;
  adapter: PyraAdapter;
  root?: string;
  outDir?: string;
  minify?: boolean;
  sourcemap?: boolean | "inline" | "external";
  /** Suppress the build report table. */
  silent?: boolean;
}

export interface BuildResult {
  manifest: RouteManifest;
  clientOutputCount: number;
  serverOutputCount: number;
  totalDurationMs: number;
}
