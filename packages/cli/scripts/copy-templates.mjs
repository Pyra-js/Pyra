import { cpSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

cpSync(join(rootDir, 'templates'), join(rootDir, 'dist', 'templates'), {
  recursive: true
});

console.log('✓ Templates copied to dist/templates');
