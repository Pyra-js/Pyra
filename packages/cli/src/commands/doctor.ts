import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import pc from 'picocolors';
import { loadConfig, findConfigFile, getEntry } from 'pyrajs-shared';
import type { PyraConfig } from 'pyrajs-shared';
import { scanRoutes } from 'pyrajs-core';
import type { ScanResult } from 'pyrajs-core';
import { getVersion } from '../utils/reporter.js';
import { detectCapabilities } from '../utils/dev-banner.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type ProjectMode = 'static' | 'ssr' | 'misconfigured';

// 'section' renders as a bold group header with no icon, separating check groups.
interface DiagnosticCheck {
  level: 'ok' | 'warn' | 'info' | 'section';
  message: string;
}

interface DoctorDiagnosis {
  mode: ProjectMode;
  modeLabel: string;
  modeNote?: string;
  explanation: string[];
  checks: DiagnosticCheck[];
  nextSteps?: string[];
  routeStats?: {
    pages: number;
    apiRoutes: number;
    layouts: number;
    middlewares: number;
  };
}

export interface DoctorOptions {
  config?: string;
  silent: boolean;
  color: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_ROUTES_DIR = 'src/routes';

// All known lockfile filenames keyed by package manager name.
const LOCKFILES: Record<string, string> = {
  pnpm: 'pnpm-lock.yaml',
  yarn: 'yarn.lock',
  bun: 'bun.lockb',
  npm: 'package-lock.json',
};

// The four packages that form the Pyra platform. We read their installed
// versions from node_modules/ to surface drift at a glance.
const PYRA_PACKAGES = [
  'pyrajs-cli',
  'pyrajs-core',
  'pyrajs-shared',
  'pyrajs-adapter-react',
];

// ─── Helper: Walk src/ and find the newest file mtime ────────────────────────
//
// Used by the staleness check to compare source files against the manifest.
// Capped at maxDepth to avoid runaway recursion in large projects.

function getNewestMtimeInDir(dir: string, maxDepth = 4, depth = 0): number {
  if (depth > maxDepth) return 0;
  let newest = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      // Skip hidden directories and node_modules entirely.
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        newest = Math.max(newest, getNewestMtimeInDir(full, maxDepth, depth + 1));
      } else {
        try {
          newest = Math.max(newest, statSync(full).mtimeMs);
        } catch {
          // File may have been deleted between readdir and stat — safe to ignore.
        }
      }
    }
  } catch {
    // Directory inaccessible or disappeared — not fatal.
  }
  return newest;
}

// ─── Helper: Run tsc --noEmit ─────────────────────────────────────────────────
//
// Prefers node_modules/.bin/tsc so it works in projects that have typescript
// as a devDependency but not globally on PATH. Falls back to global tsc.
// Times out after 15 seconds to keep doctor responsive.

async function runTscCheck(
  root: string,
): Promise<{ errors: number; timedOut: boolean; notFound: boolean }> {
  const localTsc = path.join(root, 'node_modules/.bin/tsc');
  const tscCmd = existsSync(localTsc) ? localTsc : 'tsc';

  return new Promise((resolve) => {
    let output = '';
    let settled = false;

    const child = spawn(tscCmd, ['--noEmit'], {
      cwd: root,
      stdio: 'pipe',
      // Required on Windows for PATH resolution when using the global tsc.
      shell: process.platform === 'win32',
    });

    child.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { output += d.toString(); });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ errors: 0, timedOut: true, notFound: false });
    }, 15_000);

    child.on('close', (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ errors: 0, timedOut: false, notFound: false });
      } else {
        // Count distinct "error TSxxxx" occurrences. If tsc printed errors
        // without matching that pattern, fall back to reporting at least 1.
        const count = (output.match(/error TS\d+/g) || []).length;
        resolve({ errors: count || 1, timedOut: false, notFound: false });
      }
    });

    child.on('error', () => {
      // ENOENT means neither local nor global tsc was found.
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ errors: 0, timedOut: false, notFound: true });
    });
  });
}

// ─── Check: Environment ───────────────────────────────────────────────────────
//
// Node.js version and lockfile state. These run unconditionally because they
// catch problems before any config or package manager interaction can happen.

function checkEnvironment(root: string, checks: DiagnosticCheck[]): void {
  checks.push({ level: 'section', message: 'Environment' });

  // Node.js version — Pyra requires >=18.0.0 (native fetch, structuredClone, etc.)
  const nodeVersion = process.version; // e.g. 'v20.11.0'
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (major < 18) {
    checks.push({
      level: 'warn',
      message: `Node.js ${nodeVersion} is below the required minimum v18.0.0`,
    });
  } else {
    checks.push({ level: 'ok', message: `Node.js ${nodeVersion}` });
  }

  // Lockfile consistency — having two lockfiles means two package managers have
  // touched the project, which leads to phantom dependency differences.
  const present = Object.entries(LOCKFILES).filter(([, file]) =>
    existsSync(path.join(root, file)),
  );
  if (present.length > 1) {
    checks.push({
      level: 'warn',
      message: `Multiple lockfiles found (${present.map(([n]) => n).join(', ')}) — delete all but one`,
    });
  } else if (present.length === 1) {
    checks.push({ level: 'ok', message: `Package manager: ${present[0][0]}` });
  } else {
    checks.push({ level: 'info', message: 'No lockfile found in project root' });
  }
}

// ─── Check: Dependencies ──────────────────────────────────────────────────────
//
// Verifies that node_modules exists, surfaces installed pyrajs-* versions,
// and checks peer dependencies that are easy to silently miss (React, sharp).

function checkDependencies(
  root: string,
  config: PyraConfig | undefined,
  checks: DiagnosticCheck[],
): void {
  checks.push({ level: 'section', message: 'Dependencies' });

  // Without node_modules none of the package reads below will work.
  if (!existsSync(path.join(root, 'node_modules'))) {
    checks.push({
      level: 'warn',
      message: 'node_modules not found — run your install command first',
    });
    return;
  }

  // Installed pyrajs-* versions. Surfaced as info so you can spot if a project
  // is running an older version of one package than the others.
  const versions: string[] = [];
  for (const pkg of PYRA_PACKAGES) {
    const pkgJsonPath = path.join(root, 'node_modules', pkg, 'package.json');
    if (existsSync(pkgJsonPath)) {
      try {
        const parsed = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { version?: string };
        if (parsed.version) versions.push(`${pkg}@${parsed.version}`);
      } catch {
        // Malformed package.json — skip silently.
      }
    }
  }
  if (versions.length > 0) {
    checks.push({ level: 'info', message: `Installed: ${versions.join('  ')}` });
  }

  // React peer dependency. React is a peer dep of pyrajs-adapter-react, so it
  // won't be auto-installed and is the most common "works on my machine" mistake.
  const adapterName =
    config?.adapter === false
      ? null
      : typeof config?.adapter === 'object' && config?.adapter !== null
        ? (config.adapter as { name: string }).name
        : 'react'; // default adapter is react

  if (adapterName === 'react' || adapterName == null) {
    const reactPkgPath = path.join(root, 'node_modules/react/package.json');
    if (existsSync(reactPkgPath)) {
      try {
        const parsed = JSON.parse(readFileSync(reactPkgPath, 'utf-8')) as { version?: string };
        checks.push({ level: 'ok', message: `react@${parsed.version ?? '?'} installed` });
      } catch {
        checks.push({ level: 'ok', message: 'react installed' });
      }
    } else {
      checks.push({
        level: 'warn',
        message: 'react is not installed — required by the react adapter (npm install react react-dom)',
      });
    }
  }

  // sharp is an optional peer dep of pyrajs-core — only needed when the
  // pyraImages() plugin is active. Flag it when the plugin is configured
  // but the package is missing to prevent silent no-op image optimization.
  const hasImagePlugin = config?.plugins?.some((p) => p.name === 'pyra:images') ?? false;
  if (hasImagePlugin) {
    const sharpPkgPath = path.join(root, 'node_modules/sharp/package.json');
    if (existsSync(sharpPkgPath)) {
      try {
        const parsed = JSON.parse(readFileSync(sharpPkgPath, 'utf-8')) as { version?: string };
        checks.push({
          level: 'ok',
          message: `sharp@${parsed.version ?? '?'} installed (required by pyraImages())`,
        });
      } catch {
        checks.push({ level: 'ok', message: 'sharp installed (required by pyraImages())' });
      }
    } else {
      checks.push({
        level: 'warn',
        message: 'sharp not installed — required by the pyraImages() plugin (npm install sharp)',
      });
    }
  }
}

// ─── Check: Configuration ─────────────────────────────────────────────────────
//
// TypeScript config, .env files, active env vars, and validation of Pyra-specific
// config values that are easy to misconfigure (trace mode, bundle size threshold).

function checkConfiguration(root: string, config: PyraConfig, checks: DiagnosticCheck[]): void {
  checks.push({ level: 'section', message: 'Configuration' });

  // tsconfig.json — Pyra uses TypeScript throughout and expects strict mode.
  const tsconfigPath = path.join(root, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) {
    checks.push({ level: 'warn', message: 'No tsconfig.json found in project root' });
  } else {
    try {
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8')) as {
        compilerOptions?: { strict?: boolean };
      };
      if (tsconfig.compilerOptions?.strict === true) {
        checks.push({ level: 'ok', message: 'tsconfig.json found, strict mode enabled' });
      } else {
        checks.push({
          level: 'info',
          message: 'tsconfig.json found, strict mode is not enabled (recommended)',
        });
      }
    } catch {
      checks.push({ level: 'warn', message: 'tsconfig.json found but could not be parsed' });
    }
  }

  // .env files — surface whichever are present so developers know which are loaded.
  const envFiles = ['.env', '.env.local', '.env.development', '.env.production'].filter((f) =>
    existsSync(path.join(root, f)),
  );
  if (envFiles.length > 0) {
    checks.push({ level: 'ok', message: `.env file(s) present: ${envFiles.join(', ')}` });
  }

  // Active PYRA_* env vars in the current shell. Useful for spotting vars that
  // were set in CI or a parent shell and may affect runtime behaviour.
  const prefix =
    typeof config.env?.prefix === 'string' ? config.env.prefix : 'PYRA_';
  const activeVars = Object.keys(process.env).filter((k) => k.startsWith(prefix));
  if (activeVars.length > 0) {
    checks.push({
      level: 'info',
      message: `${activeVars.length} ${prefix}* env var(s) active: ${activeVars.join(', ')}`,
    });
  } else {
    checks.push({ level: 'info', message: `No ${prefix}* environment variables set` });
  }

  // trace.production — only three valid string values; a typo silently disables tracing.
  const traceProduction = config.trace?.production;
  if (traceProduction !== undefined) {
    const valid: string[] = ['off', 'header', 'on'];
    if (!valid.includes(traceProduction)) {
      checks.push({
        level: 'warn',
        message: `trace.production "${traceProduction}" is invalid — must be 'off', 'header', or 'on'`,
      });
    } else {
      checks.push({ level: 'ok', message: `trace.production: ${traceProduction}` });
    }
  }

  // buildReport.warnSize — a threshold set below 10 KB will flag almost every
  // route; above 5 MB it will never fire. Both are almost certainly mistakes.
  const warnSize = config.buildReport?.warnSize;
  if (warnSize !== undefined) {
    if (warnSize < 10 * 1024) {
      checks.push({
        level: 'warn',
        message: `buildReport.warnSize is ${warnSize} bytes — very low, will cause excessive warnings`,
      });
    } else if (warnSize > 5 * 1024 * 1024) {
      checks.push({
        level: 'warn',
        message: `buildReport.warnSize is ${Math.round(warnSize / 1024)} KB — very high, large bundles may go unnoticed`,
      });
    } else {
      checks.push({ level: 'ok', message: `buildReport.warnSize: ${Math.round(warnSize / 1024)} KB` });
    }
  }
}

// ─── Check: Build Artifacts ───────────────────────────────────────────────────
//
// Checks whether the project has been built and whether the build is stale.
// A missing dist/ is only a warning in an SSR project (pyra start won't work),
// but is benign in a dev-only workflow.

function checkBuildArtifacts(
  root: string,
  config: PyraConfig | undefined,
  checks: DiagnosticCheck[],
): void {
  checks.push({ level: 'section', message: 'Build Artifacts' });

  const outDir = config?.build?.outDir ?? config?.outDir ?? 'dist';
  const distPath = path.resolve(root, outDir);
  const manifestPath = path.join(distPath, 'manifest.json');

  if (!existsSync(distPath)) {
    checks.push({
      level: 'info',
      message: `No ${outDir}/ directory — run "pyra build" before using "pyra start"`,
    });
    return;
  }

  checks.push({ level: 'ok', message: `Build output (${outDir}/) exists` });

  if (!existsSync(manifestPath)) {
    checks.push({
      level: 'warn',
      message: 'manifest.json missing from dist/ — run "pyra build" again',
    });
    return;
  }

  // Validate the manifest is parseable and extract the build timestamp.
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
      builtAt?: string;
    };
    const builtAt =
      typeof manifest.builtAt === 'string'
        ? new Date(manifest.builtAt).toLocaleString()
        : 'unknown';
    checks.push({ level: 'ok', message: `manifest.json valid — built ${builtAt}` });
  } catch {
    checks.push({ level: 'warn', message: 'manifest.json is malformed or unreadable' });
    return;
  }

  // Staleness: if any file under src/ is newer than the manifest, the dist/
  // is out of date. We walk src/ up to depth 4 to keep this fast.
  const srcDir = path.join(root, 'src');
  if (existsSync(srcDir)) {
    try {
      const manifestMtime = statSync(manifestPath).mtimeMs;
      const newestSrc = getNewestMtimeInDir(srcDir);
      if (newestSrc > manifestMtime) {
        checks.push({
          level: 'warn',
          message: 'Source files are newer than dist/ — consider running "pyra build" again',
        });
      } else {
        checks.push({ level: 'ok', message: 'Build is up to date with source' });
      }
    } catch {
      // stat failed — skip the staleness check silently.
    }
  }
}

// ─── Check: Route Analysis ────────────────────────────────────────────────────
//
// Deep inspection of the scanned route tree. All of these are soft issues —
// the server will still start, but the problems below commonly cause confusing
// runtime behaviour (blank pages, unhandled errors, layout never rendering).

function checkRoutes(root: string, scanResult: ScanResult, checks: DiagnosticCheck[]): void {
  checks.push({ level: 'section', message: 'Route Analysis' });

  const pageRoutes = scanResult.routes.filter((r) => r.type === 'page');

  // 404 page — without one, Pyra uses a plain built-in fallback.
  if (scanResult.notFoundPage) {
    checks.push({ level: 'ok', message: '404.tsx custom not-found page found' });
  } else {
    checks.push({ level: 'info', message: 'No 404.tsx — Pyra will use the built-in not-found page' });
  }

  // Error boundaries — surface how many exist and flag dynamic routes that
  // have no boundary, since those are most likely to throw at runtime.
  if (scanResult.errors.length > 0) {
    checks.push({
      level: 'ok',
      message: `${scanResult.errors.length} error boundary file(s) found`,
    });
  } else {
    checks.push({ level: 'info', message: 'No error.tsx boundary files — errors will use the built-in page' });
  }

  // Dynamic routes without an error boundary. These are the routes that are
  // most likely to throw (missing param, failed fetch, etc.) and the most
  // likely to produce a blank white screen without a boundary.
  const dynamicWithoutBoundary = pageRoutes.filter(
    (r) => r.params.length > 0 && !r.errorBoundaryId,
  );
  for (const route of dynamicWithoutBoundary) {
    checks.push({
      level: 'info',
      message: `${route.id}: dynamic route has no error boundary — consider adding error.tsx`,
    });
  }

  // Missing default export on page files. Core passes the default export to the
  // adapter's renderToHTML(); a missing one will produce a blank page with no
  // error because undefined is a valid React child (renders nothing).
  for (const route of pageRoutes) {
    try {
      const content = readFileSync(route.filePath, 'utf-8');
      const hasDefault =
        /export\s+default\s+/.test(content) ||
        /export\s*\{[^}]*\bdefault\b[^}]*\}/.test(content);
      if (!hasDefault) {
        const rel = path.relative(root, route.filePath);
        checks.push({
          level: 'warn',
          message: `${rel}: no default export — page will render blank`,
        });
      }
    } catch {
      // File may have been deleted between scan and read — safe to skip.
    }
  }

  // Orphaned layouts: a layout.tsx whose dirId is not referenced by any route's
  // layoutId. This happens when routes are moved or renamed without moving the
  // layout, and means the layout file never runs at runtime.
  const usedLayoutIds = new Set(scanResult.routes.map((r) => r.layoutId).filter(Boolean));
  for (const layout of scanResult.layouts) {
    if (!usedLayoutIds.has(layout.id)) {
      const rel = path.relative(root, layout.filePath);
      checks.push({ level: 'info', message: `${rel}: layout is not used by any routes` });
    }
  }

  // SSG / cache export summary. These exports tell Pyra to prerender pages at
  // build time or attach Cache-Control headers. Surfaced as a positive signal
  // so developers can verify their SSG setup is being picked up.
  let prerenderCount = 0;
  let cacheCount = 0;
  for (const route of pageRoutes) {
    try {
      const content = readFileSync(route.filePath, 'utf-8');
      if (/export\s+const\s+prerender\b/.test(content)) prerenderCount++;
      if (/export\s+const\s+cache\b/.test(content)) cacheCount++;
    } catch {
      // Skip unreadable files.
    }
  }
  if (prerenderCount > 0) {
    checks.push({
      level: 'ok',
      message: `${prerenderCount} route(s) export \`prerender\` (SSG)`,
    });
  }
  if (cacheCount > 0) {
    checks.push({
      level: 'ok',
      message: `${cacheCount} route(s) export \`cache\` (Cache-Control headers)`,
    });
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  if (options.silent) return;

  const root = process.cwd();
  const caps = detectCapabilities();
  const version = getVersion();

  // Fire tsc in parallel with all the synchronous checks below. The type check
  // is the slowest operation (can take several seconds) so starting it now
  // means we don't pay for it sequentially.
  const tscPromise = runTscCheck(root);

  const diagnosis = await diagnose(root, options.config);

  // Append tsc result at the end once it resolves.
  const tscResult = await tscPromise;
  diagnosis.checks.push({ level: 'section', message: 'TypeScript' });
  if (tscResult.notFound) {
    diagnosis.checks.push({
      level: 'info',
      message: 'tsc not found — install typescript or add it as a devDependency',
    });
  } else if (tscResult.timedOut) {
    diagnosis.checks.push({ level: 'info', message: 'tsc --noEmit timed out after 15s' });
  } else if (tscResult.errors === 0) {
    diagnosis.checks.push({ level: 'ok', message: 'No TypeScript errors (tsc --noEmit)' });
  } else {
    diagnosis.checks.push({
      level: 'warn',
      message: `${tscResult.errors} TypeScript error(s) detected (run tsc --noEmit for details)`,
    });
  }

  renderDiagnosis(diagnosis, {
    version,
    color: options.color,
    silent: options.silent,
    unicode: caps.supportsUnicode,
  });
}

// ─── Diagnosis Logic ──────────────────────────────────────────────────────────

async function diagnose(
  root: string,
  configFile?: string,
): Promise<DoctorDiagnosis> {
  const checks: DiagnosticCheck[] = [];

  // ── Environment (always runs) ──────────────────────────────────────────────
  checkEnvironment(root, checks);

  // ── Project / Config ───────────────────────────────────────────────────────
  checks.push({ level: 'section', message: 'Project' });

  const configPath = configFile || findConfigFile(root);
  if (configPath) {
    checks.push({ level: 'ok', message: `Config file found: ${path.relative(root, configPath)}` });
  } else {
    checks.push({ level: 'info', message: 'No config file (using defaults)' });
  }

  let config: PyraConfig | undefined;
  try {
    config = await loadConfig({ root, configFile, silent: true });
  } catch (err) {
    checks.push({
      level: 'warn',
      message: `Could not load config: ${err instanceof Error ? err.message : String(err)}`,
    });
    // Still run the checks that don't need a valid config.
    checkDependencies(root, undefined, checks);
    checkBuildArtifacts(root, undefined, checks);
    return {
      mode: 'static',
      modeLabel: 'Static (SPA)',
      modeNote: 'config error',
      explanation: [
        'Pyra could not read your config file. It will fall back',
        'to default settings and serve files statically.',
      ],
      checks,
      nextSteps: ['Check your config file for syntax errors or missing imports.'],
    };
  }

  // ── Routes directory ───────────────────────────────────────────────────────
  // Compute this before the entry check: SSR projects use file-based routing
  // and have no entry point, so we skip the entry check when routes exist.
  const routesDirRel = config.routesDir || DEFAULT_ROUTES_DIR;
  const routesDirAbs = path.resolve(root, routesDirRel);
  const routesDirExists = existsSync(routesDirAbs);
  const routesDirExplicitlySet =
    config.routesDir !== undefined && config.routesDir !== DEFAULT_ROUTES_DIR;

  // ── Entry point ────────────────────────────────────────────────────────────
  // Only relevant for SPA projects. Full-stack (SSR) projects use file-based
  // routing via src/routes/ and don't need a top-level entry point — skip the
  // check so we don't falsely warn about the missing src/index.ts default.
  if (!routesDirExists) {
    const entry = getEntry(config);
    const primaryEntry =
      typeof entry === 'string'
        ? entry
        : Array.isArray(entry)
          ? entry[0]
          : typeof entry === 'object' && entry !== null
            ? Object.values(entry)[0]
            : undefined;

    if (primaryEntry) {
      const entryPath = path.resolve(root, primaryEntry as string);
      if (existsSync(entryPath)) {
        checks.push({ level: 'ok', message: `Entry point: ${primaryEntry}` });
      } else {
        checks.push({ level: 'warn', message: `Entry point not found: ${primaryEntry}` });
      }
    }
  }

  // ── Route scan ─────────────────────────────────────────────────────────────
  let scanResult: ScanResult | null = null;
  if (routesDirExists) {
    try {
      scanResult = await scanRoutes(routesDirAbs, ['.tsx', '.jsx', '.ts', '.js']);
    } catch {
      checks.push({
        level: 'warn',
        message: `Could not scan routes directory: ${routesDirRel}/`,
      });
    }
  }

  const adapterDisabled = config.adapter === false;
  const hasIndexHtml = existsSync(path.join(root, 'index.html'));

  const pageCount = scanResult?.routes.filter((r) => r.type === 'page').length ?? 0;
  const apiCount = scanResult?.routes.filter((r) => r.type === 'api').length ?? 0;
  const layoutCount = scanResult?.layouts.length ?? 0;
  const middlewareCount = scanResult?.middlewares.length ?? 0;
  const hasRoutes = pageCount > 0 || apiCount > 0;

  // ── Shared checks (run for all reachable modes) ────────────────────────────
  checkDependencies(root, config, checks);
  checkConfiguration(root, config, checks);
  checkBuildArtifacts(root, config, checks);

  // ── Mode decision ──────────────────────────────────────────────────────────

  if (routesDirExists && !adapterDisabled && hasRoutes) {
    // ── SSR / Full-Stack mode ────────────────────────────────────────────────
    checks.push({ level: 'section', message: 'Routes' });
    checks.push({ level: 'ok', message: `Routes directory: ${routesDirRel}/` });

    const parts: string[] = [];
    if (pageCount > 0) parts.push(`${pageCount} page${pageCount !== 1 ? 's' : ''}`);
    if (apiCount > 0) parts.push(`${apiCount} API endpoint${apiCount !== 1 ? 's' : ''}`);
    checks.push({ level: 'ok', message: parts.join(', ') });

    if (layoutCount > 0) {
      checks.push({ level: 'ok', message: `${layoutCount} layout${layoutCount !== 1 ? 's' : ''}` });
    }
    if (middlewareCount > 0) {
      checks.push({
        level: 'ok',
        message: `${middlewareCount} middleware file${middlewareCount !== 1 ? 's' : ''}`,
      });
    }

    const adapterName =
      typeof config.adapter === 'object' && config.adapter !== null
        ? (config.adapter as { name: string }).name
        : 'react';
    checks.push({ level: 'ok', message: `Adapter: ${adapterName}` });

    // Deep per-route analysis only runs in SSR mode where routes exist.
    if (scanResult) {
      checkRoutes(root, scanResult, checks);
    }

    return {
      mode: 'ssr',
      modeLabel: 'Full-Stack (SSR)',
      explanation: [
        'Your project uses file-based routing. When someone visits',
        'a page, Pyra renders it on the server first and sends',
        'ready-made HTML to the browser. This means faster page',
        'loads and better SEO.',
      ],
      checks,
      routeStats: {
        pages: pageCount,
        apiRoutes: apiCount,
        layouts: layoutCount,
        middlewares: middlewareCount,
      },
    };
  }

  if (!routesDirExists && routesDirExplicitlySet) {
    // ── Misconfigured mode ───────────────────────────────────────────────────
    checks.push({
      level: 'warn',
      message: `routesDir is set to "${routesDirRel}" but that folder doesn't exist`,
    });

    return {
      mode: 'misconfigured',
      modeLabel: 'Static (SPA)',
      modeNote: 'with a note',
      explanation: [
        "Your config points to a routes directory that doesn't",
        'exist yet. Pyra is falling back to static file serving.',
      ],
      checks,
      nextSteps: [
        'To fix this, either:',
        `  \u2022 Create the folder: mkdir ${routesDirRel}`,
        '  \u2022 Or remove routesDir from your config to use the default',
      ],
    };
  }

  // ── Static / SPA mode ───────────────────────────────────────────────────────
  if (!hasIndexHtml) {
    checks.push({ level: 'warn', message: 'No index.html found in project root' });
  }
  if (routesDirExists && adapterDisabled) {
    checks.push({
      level: 'warn',
      message: 'Routes directory exists but adapter is disabled (adapter: false)',
    });
  }
  if (routesDirExists && !hasRoutes) {
    checks.push({
      level: 'info',
      message: `Routes directory (${routesDirRel}/) exists but contains no routes yet`,
    });
  }

  return {
    mode: 'static',
    modeLabel: 'Static (SPA)',
    explanation: [
      'Your project is running as a single-page app. Pyra serves',
      'your files (HTML, CSS, TypeScript) directly to the browser',
      'and compiles them on the fly.',
      '',
      "This is the default setup \u2014 it's how most scaffolded Pyra",
      'projects start. Everything runs in the browser, no server',
      'rendering involved.',
    ],
    checks,
    nextSteps: [
      'Want to add server-side rendering?',
      '  Create a src/routes/ directory and add a page.tsx file.',
    ],
  };
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderDiagnosis(
  diagnosis: DoctorDiagnosis,
  opts: {
    version: string;
    color: boolean;
    silent: boolean;
    unicode: boolean;
  },
): void {
  if (opts.silent) return;

  const { color, unicode, version } = opts;
  const arrow = unicode ? '\u279C' : '>';
  const checkmark = unicode ? '\u2713' : '+';
  const warnIcon = '!';
  const infoIcon = '-';

  const lines: string[] = [];

  // Header
  if (color) {
    lines.push(`  ${pc.bold(pc.green('PYRA'))} ${pc.green(`v${version}`)}  ${pc.dim('doctor')}`);
  } else {
    lines.push(`  PYRA v${version}  doctor`);
  }
  lines.push('');

  // Mode line
  const modeStr = diagnosis.modeNote
    ? `${diagnosis.modeLabel} \u2014 ${diagnosis.modeNote}`
    : diagnosis.modeLabel;
  if (color) {
    lines.push(`  ${pc.green(arrow)}  ${pc.bold('Mode:')} ${modeStr}`);
  } else {
    lines.push(`  ${arrow}  Mode: ${modeStr}`);
  }
  lines.push('');

  // Explanation prose
  for (const line of diagnosis.explanation) {
    lines.push(line ? `  ${line}` : '');
  }
  lines.push('');

  // Checks
  for (const c of diagnosis.checks) {
    // Section headers: blank line above, bold label, no icon.
    if (c.level === 'section') {
      lines.push('');
      lines.push(color ? `  ${pc.bold(c.message)}` : `  ${c.message}`);
      continue;
    }

    const icon =
      c.level === 'ok' ? checkmark : c.level === 'warn' ? warnIcon : infoIcon;

    if (color) {
      const coloredIcon =
        c.level === 'ok'
          ? pc.green(icon)
          : c.level === 'warn'
            ? pc.yellow(icon)
            : pc.dim(icon);
      lines.push(`  ${coloredIcon}  ${c.message}`);
    } else {
      lines.push(`  ${icon}  ${c.message}`);
    }
  }

  // Next steps
  if (diagnosis.nextSteps && diagnosis.nextSteps.length > 0) {
    lines.push('');
    for (const step of diagnosis.nextSteps) {
      lines.push(color ? `  ${pc.dim(step)}` : `  ${step}`);
    }
  }

  console.log('');
  console.log(lines.join('\n'));
  console.log('');
}
