import { defineConfig } from '@pyra/cli';

export default defineConfig({
  entry: 'src/index.js',
  outDir: 'dist',
  port: 3000,
});
