import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/shared/vitest.config.ts',
  'packages/core/vitest.config.ts',
  'packages/adapter-react/vitest.config.ts',
]);
