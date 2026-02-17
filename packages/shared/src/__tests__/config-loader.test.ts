import { describe, it, expect, vi } from 'vitest';
import {
  resolveConfig,
  getPort,
  getOutDir,
  getEntry,
  validateConfig,
  DEFAULT_CONFIG,
} from '../config-loader.js';

// Mock node:fs so we can control existsSync for validateConfig tests.
// In ESM, module exports are non-configurable so vi.spyOn doesn't work.
// vi.hoisted ensures the variable exists before the hoisted vi.mock runs.
const { mockExistsSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(() => true),
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: mockExistsSync };
});

// ─── DEFAULT_CONFIG ──────────────────────────────────────────────────────────

describe('DEFAULT_CONFIG', () => {
  it('has the expected default port', () => {
    expect(DEFAULT_CONFIG.port).toBe(3000);
  });

  it('has the expected default outDir', () => {
    expect(DEFAULT_CONFIG.outDir).toBe('dist');
  });

  it('has the expected default entry', () => {
    expect(DEFAULT_CONFIG.entry).toBe('src/index.ts');
  });

  it('has the expected default renderMode', () => {
    expect(DEFAULT_CONFIG.renderMode).toBe('ssr');
  });
});

// ─── resolveConfig ───────────────────────────────────────────────────────────

describe('resolveConfig', () => {
  it('merges user config over defaults', () => {
    const result = resolveConfig({ port: 4000 });
    expect(result.port).toBe(4000);
    expect(result.outDir).toBe('dist'); // default preserved
  });

  it('forces mode from parameter, overriding user config', () => {
    const result = resolveConfig({ mode: 'development' }, 'production');
    expect(result.mode).toBe('production');
  });

  it('propagates shorthand outDir to build.outDir when build.outDir is absent', () => {
    const result = resolveConfig({ outDir: 'out' });
    expect(result.build?.outDir).toBe('out');
  });

  it('does not overwrite build.outDir if already set', () => {
    const result = resolveConfig({ outDir: 'out', build: { outDir: 'explicit' } });
    expect(result.build?.outDir).toBe('explicit');
  });

  it('propagates shorthand port to server.port when server.port is absent', () => {
    const result = resolveConfig({ port: 8080 });
    expect(result.server?.port).toBe(8080);
  });

  it('does not overwrite server.port if already set', () => {
    const result = resolveConfig({ port: 8080, server: { port: 9090 } });
    expect(result.server?.port).toBe(9090);
  });

  it('returns a new object and does not mutate the input', () => {
    const input = { port: 3000 };
    const result = resolveConfig(input);
    expect(result).not.toBe(input);
  });
});

// ─── getPort ─────────────────────────────────────────────────────────────────

describe('getPort', () => {
  it('returns server.port when set', () => {
    expect(getPort({ server: { port: 4000 } })).toBe(4000);
  });

  it('falls back to top-level port', () => {
    expect(getPort({ port: 5000 })).toBe(5000);
  });

  it('falls back to DEFAULT_CONFIG.port when neither is set', () => {
    expect(getPort({})).toBe(DEFAULT_CONFIG.port);
  });

  it('prefers server.port over top-level port', () => {
    expect(getPort({ port: 5000, server: { port: 4000 } })).toBe(4000);
  });
});

// ─── getOutDir ───────────────────────────────────────────────────────────────

describe('getOutDir', () => {
  it('returns build.outDir when set', () => {
    expect(getOutDir({ build: { outDir: 'build' } })).toBe('build');
  });

  it('falls back to top-level outDir', () => {
    expect(getOutDir({ outDir: 'output' })).toBe('output');
  });

  it('falls back to DEFAULT_CONFIG.outDir when neither is set', () => {
    expect(getOutDir({})).toBe(DEFAULT_CONFIG.outDir);
  });
});

// ─── getEntry ────────────────────────────────────────────────────────────────

describe('getEntry', () => {
  it('returns entry when set as a string', () => {
    expect(getEntry({ entry: 'src/main.ts' })).toBe('src/main.ts');
  });

  it('returns entry when set as an array', () => {
    expect(getEntry({ entry: ['src/a.ts', 'src/b.ts'] })).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('falls back to DEFAULT_CONFIG.entry when not set', () => {
    expect(getEntry({})).toBe(DEFAULT_CONFIG.entry);
  });
});

// ─── validateConfig ──────────────────────────────────────────────────────────

describe('validateConfig', () => {
  it('does not throw for a valid config', () => {
    mockExistsSync.mockReturnValue(true);
    expect(() => validateConfig({ entry: 'src/index.ts', root: '/some/dir' })).not.toThrow();
  });

  it('throws when entry is absent', () => {
    expect(() => validateConfig({})).toThrow('entry is required');
  });

  it('throws when top-level port is out of range (below 1)', () => {
    expect(() => validateConfig({ entry: 'x', port: 0 })).toThrow('port must be between 1 and 65535');
  });

  it('throws when top-level port is out of range (above 65535)', () => {
    expect(() => validateConfig({ entry: 'x', port: 99999 })).toThrow('port must be between 1 and 65535');
  });

  it('throws when server.port is out of range', () => {
    expect(() => validateConfig({ entry: 'x', server: { port: 0 } })).toThrow('port must be between 1 and 65535');
  });

  it('throws when root directory does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(() => validateConfig({ entry: 'x', root: '/nonexistent' })).toThrow('root directory does not exist');
  });

  it('accepts boundary port values 1 and 65535', () => {
    mockExistsSync.mockReturnValue(true);
    expect(() => validateConfig({ entry: 'x', port: 1 })).not.toThrow();
    expect(() => validateConfig({ entry: 'x', port: 65535 })).not.toThrow();
  });
});
