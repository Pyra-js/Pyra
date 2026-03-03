import { defineConfig } from '@pyra/cli';

export default defineConfig({
  entry: 'src/main.tsx',
  outDir: 'dist',
  port: 3000,
});
