import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    name: 'adapter-react',
    environment: 'node',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    globals: false,
  },
  resolve: {
    alias: {
      '@pyra-js/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
});
