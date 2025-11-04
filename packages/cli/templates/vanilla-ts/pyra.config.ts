import { defineConfig } from '@pyra/cli';

export default defineConfig({
  entry: 'src/index.ts',
  outDir: 'dist',
  port: 3000,
});
