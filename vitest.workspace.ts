import { defineWorkspace } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const sharedSrc = resolve(root, 'packages/shared/src/index.ts');

export default defineWorkspace([
  {
    test: {
      name: 'shared',
      environment: 'node',
      root: resolve(root, 'packages/shared'),
      include: ['src/__tests__/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'core',
      environment: 'node',
      root: resolve(root, 'packages/core'),
      include: ['src/__tests__/**/*.test.ts'],
    },
    resolve: {
      alias: {
        'pyrajs-shared': sharedSrc,
      },
    },
  },
  {
    test: {
      name: 'adapter-react',
      environment: 'node',
      root: resolve(root, 'packages/adapter-react'),
      include: ['src/__tests__/**/*.test.{ts,tsx}'],
    },
    resolve: {
      alias: {
        'pyrajs-shared': sharedSrc,
      },
    },
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'react',
    },
  },
]);
