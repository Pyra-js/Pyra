export interface Release {
  version: string;
  date: string;
  highlights: string[];
}

export const releases: Release[] = [
  {
    version: '2.0',
    date: '2026-01-15',
    highlights: ['Svelte adapter', 'Streaming SSR', 'Edge runtime support'],
  },
  {
    version: '1.1',
    date: '2025-11-03',
    highlights: ['Request tracing dashboard', 'Improved build report', 'pnpm workspace support'],
  },
  {
    version: '1.0',
    date: '2025-09-20',
    highlights: ['Error boundaries', 'Custom 404 pages', 'Graceful shutdown', 'CLI scaffolding'],
  },
];

export function getRelease(version: string): Release | undefined {
  return releases.find((r) => r.version === version);
}
