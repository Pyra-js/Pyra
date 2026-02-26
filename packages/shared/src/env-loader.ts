import fs from "node:fs";
import path from "node:path";
import { log } from "./logger.js";

/**
 * Parse the contents of a .env file into a key→value map.
 *
 * Handles:
 *   KEY=value
 *   KEY="quoted value"
 *   KEY='single quoted'
 *   export KEY=value       (optional export prefix, for shell compatibility)
 *   KEY=value  # inline comment
 *   # full-line comment
 *   (blank lines ignored)
 *
 * Does NOT mutate process.env — callers decide what to do with the result.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    // Skip blank lines and full-line comments
    if (!line || line.startsWith("#")) continue;

    // Strip optional leading "export "
    const stripped = line.startsWith("export ") ? line.slice(7).trim() : line;

    // Split on the first "=" only
    const eqIndex = stripped.indexOf("=");
    if (eqIndex === -1) continue;

    const key = stripped.slice(0, eqIndex).trim();
    if (!key) continue;

    let value = stripped.slice(eqIndex + 1);

    // Handle double-quoted values — preserves inner whitespace, strips the quotes
    if (value.startsWith('"') && value.includes('"', 1)) {
      const close = value.indexOf('"', 1);
      value = value.slice(1, close);
    }
    // Handle single-quoted values — same rule, no interpolation
    else if (value.startsWith("'") && value.includes("'", 1)) {
      const close = value.indexOf("'", 1);
      value = value.slice(1, close);
    }
    // Unquoted: strip trailing inline comment and surrounding whitespace
    else {
      const commentIdx = value.indexOf(" #");
      if (commentIdx !== -1) {
        value = value.slice(0, commentIdx);
      }
      value = value.trim();
    }

    result[key] = value;
  }

  return result;
}

export interface LoadEnvFilesOptions {
  /** Project root — used as the default directory when dir is not set. */
  root: string;
  /** Current mode: 'development' | 'production'. Used to load .env.[mode] files. */
  mode: string;
  /** Directory containing .env files. Defaults to root. */
  dir?: string;
  /** Additional .env files to load (absolute or root-relative paths). Loaded last, highest priority. */
  files?: string[];
}

/**
 * Discover and load .env files into process.env.
 *
 * Files are loaded in priority order (lowest → highest):
 *   1. .env               — base values for all environments
 *   2. .env.local         — local overrides, should be gitignored
 *   3. .env.[mode]        — e.g. .env.development, .env.production
 *   4. .env.[mode].local  — mode-specific local overrides, should be gitignored
 *   5. config.env.files   — explicit extras from pyra.config (highest priority)
 *
 * Shell environment variables always win: a key already set in process.env
 * is never overwritten by a file value.  This is the standard dotenv
 * convention and prevents accidental secret leakage from committed files.
 */
export function loadEnvFiles(opts: LoadEnvFilesOptions): void {
  const envDir = opts.dir
    ? path.resolve(opts.root, opts.dir)
    : opts.root;

  // Standard discovery order — later entries win over earlier ones
  const candidates: string[] = [
    path.join(envDir, ".env"),
    path.join(envDir, ".env.local"),
    path.join(envDir, `.env.${opts.mode}`),
    path.join(envDir, `.env.${opts.mode}.local`),
  ];

  // User-specified extras are highest priority
  if (opts.files && opts.files.length > 0) {
    for (const f of opts.files) {
      candidates.push(path.isAbsolute(f) ? f : path.resolve(opts.root, f));
    }
  }

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      log.warn(`[env] Could not read ${path.relative(opts.root, filePath)}`);
      continue;
    }

    const parsed = parseEnvFile(content);
    let loaded = 0;

    for (const [key, value] of Object.entries(parsed)) {
      // Shell wins — never overwrite vars that are already in process.env
      if (process.env[key] !== undefined) continue;
      process.env[key] = value;
      loaded++;
    }

    if (loaded > 0) {
      log.info(`[env] loaded ${path.relative(opts.root, filePath)} (${loaded} var${loaded === 1 ? "" : "s"})`);
    }
  }
}
