import { defineConfig } from '@pyra-js/cli';

export default defineConfig({
  entry: 'src/index.ts',
  outDir: 'dist',
  port: 3000,
});
