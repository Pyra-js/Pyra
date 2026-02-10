import pc from 'picocolors';
import type { DevServerResult, ProdServerResult } from 'pyrajs-shared';
import { resolveUrls } from 'pyrajs-shared';
import { formatDuration } from './reporter.js';

export interface DevBannerOptions {
  result: DevServerResult;
  version: string;
  color: boolean;
  silent: boolean;
  ci: boolean;
}

/**
 * Detect console capabilities for rendering decisions.
 */
export function detectCapabilities(): {
  isTTY: boolean;
  supportsColor: boolean;
  isCI: boolean;
  supportsUnicode: boolean;
} {
  const isTTY = !!process.stdout.isTTY;

  const isCI =
    !isTTY ||
    process.env.CI === 'true' ||
    process.env.CI === '1' ||
    process.env.CONTINUOUS_INTEGRATION === 'true' ||
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.JENKINS_URL !== undefined ||
    process.env.GITLAB_CI === 'true';

  const supportsColor = pc.isColorSupported;

  const supportsUnicode = detectUnicode();

  return { isTTY, supportsColor, isCI, supportsUnicode };
}

/**
 * Detect if the terminal supports Unicode characters.
 */
function detectUnicode(): boolean {
  if (process.platform !== 'win32') return true;

  // Modern Windows terminals support Unicode
  if (
    process.env.WT_SESSION ||
    process.env.TERM_PROGRAM === 'vscode' ||
    process.env.TERM === 'xterm-256color'
  ) {
    return true;
  }

  return false;
}

function getArrow(unicode: boolean): string {
  return unicode ? '\u279C' : '>';
}

/**
 * Format a URL with the port number highlighted in bold.
 */
function formatUrl(url: string, color: boolean): string {
  if (!color) return url;

  const portMatch = url.match(/:(\d+)/);
  if (portMatch) {
    const idx = url.indexOf(portMatch[0]);
    const before = url.slice(0, idx + 1); // up to and including ':'
    const port = portMatch[1];
    const after = url.slice(idx + 1 + port.length);
    return pc.cyan(before) + pc.bold(pc.cyan(port)) + pc.cyan(after);
  }
  return pc.cyan(url);
}

/**
 * Print the Vite-inspired dev server startup banner.
 */
export function printDevBanner(opts: DevBannerOptions): void {
  if (opts.silent) return;

  const { result, version, color, ci } = opts;
  const caps = detectCapabilities();
  const arrow = getArrow(caps.supportsUnicode);
  const urls = resolveUrls({
    protocol: result.protocol,
    host: result.host,
    port: result.port,
  });

  // CI / non-TTY: compact single-line output
  if (ci) {
    const time = formatDuration(result.startupMs);
    console.log(`PYRA v${version} ready in ${time} -- ${urls.local}`);
    if (result.ssr && result.adapterName) {
      console.log(`  SSR enabled via ${result.adapterName} adapter`);
    }
    for (const warning of result.warnings) {
      console.warn(`  warn: ${warning}`);
    }
    return;
  }

  // TTY: full styled banner
  const lines: string[] = [];

  // Header line
  const time = formatDuration(result.startupMs);
  if (color) {
    lines.push(
      `  ${pc.bold(pc.green('PYRA'))} ${pc.green(`v${version}`)}  ${pc.dim('ready in')} ${pc.bold(time)}`
    );
  } else {
    lines.push(`  PYRA v${version}  ready in ${time}`);
  }

  // Blank line
  lines.push('');

  // Arrow string (reused)
  const a = color ? pc.green(arrow) : arrow;

  // Local URL
  const localLabel = color ? pc.bold('Local:') : 'Local:';
  lines.push(`  ${a}  ${localLabel}   ${formatUrl(urls.local, color)}`);

  // Network URL(s)
  const networkLabel = color ? pc.bold('Network:') : 'Network:';
  if (urls.network.length > 0) {
    for (const networkUrl of urls.network) {
      lines.push(`  ${a}  ${networkLabel} ${formatUrl(networkUrl, color)}`);
    }
  } else {
    const hint = color
      ? pc.dim('use ') + pc.bold('--host') + pc.dim(' to expose')
      : 'use --host to expose';
    lines.push(`  ${a}  ${networkLabel} ${hint}`);
  }

  // SSR status (only if enabled)
  if (result.ssr && result.adapterName) {
    const ssrLabel = color ? pc.bold('SSR:') : 'SSR:';
    const routeInfo: string[] = [];
    if (result.pageRouteCount > 0) {
      routeInfo.push(`${result.pageRouteCount} page${result.pageRouteCount !== 1 ? 's' : ''}`);
    }
    if (result.apiRouteCount > 0) {
      routeInfo.push(`${result.apiRouteCount} API`);
    }
    const detail = routeInfo.length > 0
      ? `${result.adapterName} (${routeInfo.join(', ')})`
      : result.adapterName;
    const ssrValue = color ? pc.dim(detail) : detail;
    lines.push(`  ${a}  ${ssrLabel}     ${ssrValue}`);
  }

  // Blank line
  lines.push('');

  // Shortcuts hint
  const shortcutsHint = color
    ? pc.dim('press ') + pc.bold('h + enter') + pc.dim(' for shortcuts')
    : 'press h + enter for shortcuts';
  lines.push(`  ${a}  ${shortcutsHint}`);

  // Print with spacing
  console.log('');
  console.log(lines.join('\n'));
  console.log('');

  // Print warnings after the banner
  for (const warning of result.warnings) {
    if (color) {
      console.warn(`  ${pc.yellow('!')}  ${pc.dim(warning)}`);
    } else {
      console.warn(`  !  ${warning}`);
    }
  }
}

// ── Production server banner ────────────────────────────────────────────────

export interface ProdBannerOptions {
  result: ProdServerResult;
  version: string;
  color: boolean;
  silent: boolean;
  ci: boolean;
}

export function printProdBanner(opts: ProdBannerOptions): void {
  if (opts.silent) return;

  const { result, version, color, ci } = opts;
  const caps = detectCapabilities();
  const arrow = getArrow(caps.supportsUnicode);
  const urls = resolveUrls({
    protocol: result.protocol,
    host: result.host,
    port: result.port,
  });

  // CI / non-TTY: compact single-line output
  if (ci) {
    const time = formatDuration(result.startupMs);
    console.log(`PYRA v${version} serving in ${time} -- ${urls.local}`);
    console.log(`  ${result.adapterName} (${result.pageRouteCount} pages, ${result.apiRouteCount} API, ${result.ssgRouteCount} SSG)`);
    for (const warning of result.warnings) {
      console.warn(`  warn: ${warning}`);
    }
    return;
  }

  // TTY: full styled banner
  const lines: string[] = [];

  // Header line — "serving" instead of "ready" to distinguish prod
  const time = formatDuration(result.startupMs);
  if (color) {
    lines.push(
      `  ${pc.bold(pc.green('PYRA'))} ${pc.green(`v${version}`)}  ${pc.dim('serving in')} ${pc.bold(time)}`
    );
  } else {
    lines.push(`  PYRA v${version}  serving in ${time}`);
  }

  // Blank line
  lines.push('');

  // Arrow string (reused)
  const a = color ? pc.green(arrow) : arrow;

  // Local URL
  const localLabel = color ? pc.bold('Local:') : 'Local:';
  lines.push(`  ${a}  ${localLabel}   ${formatUrl(urls.local, color)}`);

  // Network URL(s)
  const networkLabel = color ? pc.bold('Network:') : 'Network:';
  if (urls.network.length > 0) {
    for (const networkUrl of urls.network) {
      lines.push(`  ${a}  ${networkLabel} ${formatUrl(networkUrl, color)}`);
    }
  } else {
    const hint = color
      ? pc.dim('use ') + pc.bold('--host') + pc.dim(' to expose')
      : 'use --host to expose';
    lines.push(`  ${a}  ${networkLabel} ${hint}`);
  }

  // Routes summary
  const routesLabel = color ? pc.bold('Routes:') : 'Routes:';
  const routeInfo: string[] = [];
  if (result.pageRouteCount > 0) {
    routeInfo.push(`${result.pageRouteCount} page${result.pageRouteCount !== 1 ? 's' : ''}`);
  }
  if (result.apiRouteCount > 0) {
    routeInfo.push(`${result.apiRouteCount} API`);
  }
  if (result.ssgRouteCount > 0) {
    routeInfo.push(`${result.ssgRouteCount} SSG`);
  }
  const detail = routeInfo.length > 0
    ? `${result.adapterName} (${routeInfo.join(', ')})`
    : result.adapterName;
  const routesValue = color ? pc.dim(detail) : detail;
  lines.push(`  ${a}  ${routesLabel}  ${routesValue}`);

  // Blank line
  lines.push('');

  // Shortcuts hint
  const shortcutsHint = color
    ? pc.dim('press ') + pc.bold('h + enter') + pc.dim(' for shortcuts')
    : 'press h + enter for shortcuts';
  lines.push(`  ${a}  ${shortcutsHint}`);

  // Print with spacing
  console.log('');
  console.log(lines.join('\n'));
  console.log('');

  // Print warnings after the banner
  for (const warning of result.warnings) {
    if (color) {
      console.warn(`  ${pc.yellow('!')}  ${pc.dim(warning)}`);
    } else {
      console.warn(`  !  ${warning}`);
    }
  }
}
