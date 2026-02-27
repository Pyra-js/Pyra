// Re-export from the refactored build directory.
// External callers (index.ts, CLI) continue to import from './build.js'.
export { build } from "./build/build-orchestrator.js";
