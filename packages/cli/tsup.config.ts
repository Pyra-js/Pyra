import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));

// Get all dependencies to mark as external
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
];

export default defineConfig({
  entry: ['src/bin.ts', 'src/index.ts', 'src/scaffold.ts', 'src/pm.ts', 'src/init.ts'],
  format: ['esm'],
  dts: true,
  outDir: 'dist',
  clean: true,
  splitting: false,
  // Mark all dependencies as external
  external,
  // Mark as platform Node.js
  platform: 'node',
  // Target Node.js 18+
  target: 'node18',
});
