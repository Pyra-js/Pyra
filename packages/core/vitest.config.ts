import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    name: 'core',
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      'pyrajs-shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});
