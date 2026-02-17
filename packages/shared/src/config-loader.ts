import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PyraConfig, PyraMode } from './types.js';
import { log } from './logger.js';

/**
 * Configuration file names in order of priority
 */
const CONFIG_FILES = [
  'pyra.config.ts',
  'pyra.config.js',
  'pyra.config.mjs',
  'pyra.config.cjs',
  '.pyrarc.ts',
  '.pyrarc.js',
  '.pyrarc.mjs',
] as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<
  Pick<PyraConfig, 'entry' | 'outDir' | 'port' | 'mode' | 'root' | 'renderMode'>
> = {
  entry: 'src/index.ts',
  outDir: 'dist',
  port: 3000,
  mode: 'development',
  root: process.cwd(),
  renderMode: 'ssr',
};

/**
 * Find the configuration file in the project directory
 */
export function findConfigFile(root: string = process.cwd()): string | null {
  for (const fileName of CONFIG_FILES) {
    const filePath = join(root, fileName);
    if (existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * Load and parse the configuration file
 */
export async function loadConfigFile(
  configPath: string,
  mode: PyraMode = 'development'
): Promise<PyraConfig> {
  try {
    // Convert to file URL for dynamic import (works with both TS and JS)
    const fileUrl = pathToFileURL(configPath).href;

    // Dynamic import the config
    const configModule = await import(fileUrl);

    // Get the default export
    let config = configModule.default || configModule;

    // If config is a function, call it with the mode
    if (typeof config === 'function') {
      config = await config(mode);
    }

    return config as PyraConfig;
  } catch (error) {
    log.error(`Failed to load config from ${configPath}: ${error}`);
    throw error;
  }
}

/**
 * Resolve the final configuration by merging user config with defaults
 */
export function resolveConfig(
  userConfig: PyraConfig,
  mode: PyraMode = 'development'
): PyraConfig {
  const config: PyraConfig = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    mode,
  };

  // Handle shorthand properties
  if (userConfig.outDir && !userConfig.build?.outDir) {
    config.build = {
      ...config.build,
      outDir: userConfig.outDir,
    };
  }

  if (userConfig.port && !userConfig.server?.port) {
    config.server = {
      ...config.server,
      port: userConfig.port,
    };
  }

  return config;
}

/**
 * Load Pyra configuration from the project
 *
 * This is the main entry point for loading configuration.
 *
 * @param options - Configuration loading options
 * @returns Resolved Pyra configuration
 *
 * @example
 * ```typescript
 * // Load config from default location
 * const config = await loadConfig();
 *
 * // Load with specific mode
 * const config = await loadConfig({ mode: 'production' });
 *
 * // Load from specific directory
 * const config = await loadConfig({ root: '/path/to/project' });
 * ```
 */
export async function loadConfig(options: {
  root?: string;
  mode?: PyraMode;
  configFile?: string;
  /** Suppress config loading log messages (default: true). */
  silent?: boolean;
} = {}): Promise<PyraConfig> {
  const root = options.root || process.cwd();
  const mode = options.mode || 'development';
  const silent = options.silent ?? true;

  // Find config file
  const configPath = options.configFile || findConfigFile(root);

  let userConfig: PyraConfig = {};

  if (configPath) {
    if (!silent) log.info(`Loading config from ${configPath}`);
    userConfig = await loadConfigFile(configPath, mode);
  } else {
    if (!silent) log.info('No config file found, using defaults');
  }

  // Set root directory
  if (!userConfig.root) {
    userConfig.root = root;
  }

  // Resolve and merge with defaults
  const config = resolveConfig(userConfig, mode);

  return config;
}

/**
 * Validate that required configuration values are present
 */
export function validateConfig(config: PyraConfig): void {
  // Entry validation
  if (!config.entry) {
    throw new Error('Config validation error: entry is required');
  }

  // Port validation
  const port = config.port ?? config.server?.port;
  if (port != null && (port < 1 || port > 65535)) {
    throw new Error(`Config validation error: port must be between 1 and 65535 (got ${port})`);
  }

  // Root directory validation
  if (config.root && !existsSync(config.root)) {
    throw new Error(`Config validation error: root directory does not exist: ${config.root}`);
  }
}

/**
 * Get the effective port from configuration
 */
export function getPort(config: PyraConfig): number {
  return config.server?.port || config.port || DEFAULT_CONFIG.port;
}

/**
 * Get the effective output directory from configuration
 */
export function getOutDir(config: PyraConfig): string {
  return config.build?.outDir || config.outDir || DEFAULT_CONFIG.outDir;
}

/**
 * Get the effective entry point(s) from configuration
 */
export function getEntry(config: PyraConfig): string | string[] | Record<string, string> {
  return config.entry || DEFAULT_CONFIG.entry;
}
