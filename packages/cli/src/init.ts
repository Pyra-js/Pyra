/**
 * Project Initialization Utility
 *
 * Scaffolds a new Pyra project with automatic package manager detection
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { log } from 'pyrajs-shared';
import { detectPM, spawnPM, type PMName } from './pm.js';

export type InitOptions = {
  /** Project name (directory name) */
  projectName: string;
  /** Override package manager detection */
  pm?: PMName;
  /** Skip install step */
  skipInstall?: boolean;
  /** Project template (optional, for future expansion) */
  template?: string;
};

/**
 * Generate package.json content
 */
function generatePackageJson(projectName: string): string {
  const pkg = {
    name: projectName,
    version: '0.1.0',
    type: 'module',
    private: true,
    scripts: {
      dev: 'pyra dev',
      build: 'pyra build',
    },
    devDependencies: {
      'pyrajs-cli': '^0.0.3',
    },
  };

  return JSON.stringify(pkg, null, 2) + '\n';
}

/**
 * Generate index.html content
 */
function generateIndexHtml(projectName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName}</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/index.ts"></script>
</body>
</html>
`;
}

/**
 * Generate src/index.ts content
 */
function generateIndexTs(): string {
  return `// Welcome to your Pyra project!
// Start the dev server with: npm run dev

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  app.innerHTML = \`
    <h1>🔥 Pyra.js</h1>
    <p>Your project is ready!</p>
    <p>Edit <code>src/index.ts</code> to get started.</p>
  \`;
}

// Hot Module Replacement (HMR) API
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    console.log('🔥 HMR update');
  });
}
`;
}

/**
 * Generate pyra.config.js content
 */
function generatePyraConfig(): string {
  return `import { defineConfig } from 'pyrajs-cli';

export default defineConfig({
  // Entry point
  entry: 'src/index.ts',

  // Dev server configuration
  server: {
    port: 3000,
    open: true,
  },

  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
`;
}

/**
 * Generate .gitignore content
 */
function generateGitignore(): string {
  return `# Dependencies
node_modules/

# Build output
dist/
build/
.pyra/

# Environment
.env
.env.local
.env.*.local

# Editor
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
`;
}

/**
 * Initialize a new Pyra project
 *
 * @param options - Initialization options
 */
export async function initProject(options: InitOptions): Promise<void> {
  const { projectName, pm: pmOverride, skipInstall = false } = options;

  // Resolve project directory
  const projectDir = resolve(process.cwd(), projectName);

  // Check if directory already exists
  if (existsSync(projectDir)) {
    log.error(`Directory "${projectName}" already exists`);
    throw new Error('Project directory already exists');
  }

  log.info(`Creating new Pyra project: ${projectName}`);
  log.info('');

  // 1. Create project directory
  mkdirSync(projectDir, { recursive: true });
  log.success(`✓ Created directory: ${projectName}/`);

  // 2. Create src directory
  const srcDir = join(projectDir, 'src');
  mkdirSync(srcDir, { recursive: true });
  log.success(`✓ Created directory: ${projectName}/src/`);

  // 3. Write package.json
  const packageJsonPath = join(projectDir, 'package.json');
  writeFileSync(packageJsonPath, generatePackageJson(projectName), 'utf-8');
  log.success(`✓ Created package.json`);

  // 4. Write index.html
  const indexHtmlPath = join(projectDir, 'index.html');
  writeFileSync(indexHtmlPath, generateIndexHtml(projectName), 'utf-8');
  log.success(`✓ Created index.html`);

  // 5. Write src/index.ts
  const indexTsPath = join(srcDir, 'index.ts');
  writeFileSync(indexTsPath, generateIndexTs(), 'utf-8');
  log.success(`✓ Created src/index.ts`);

  // 6. Write pyra.config.js
  const configPath = join(projectDir, 'pyra.config.js');
  writeFileSync(configPath, generatePyraConfig(), 'utf-8');
  log.success(`✓ Created pyra.config.js`);

  // 7. Write .gitignore
  const gitignorePath = join(projectDir, '.gitignore');
  writeFileSync(gitignorePath, generateGitignore(), 'utf-8');
  log.success(`✓ Created .gitignore`);

  log.info('');
  log.success('Project scaffolded successfully!');
  log.info('');

  // 8. Detect package manager and install dependencies
  if (!skipInstall) {
    log.info('Installing dependencies...');
    log.info('');

    try {
      const pm = await detectPM(projectDir, pmOverride);

      // Run install command
      await spawnPM(pm, ['install'], { cwd: projectDir });

      log.info('');
      log.success('✓ Dependencies installed');
    } catch (error) {
      log.warn('Failed to install dependencies');
      log.warn('Run the install command manually:');
      log.warn('');
      log.warn(`  cd ${projectName}`);
      log.warn(`  npm install`);
    }
  }

  // 9. Show next steps
  log.info('');
  log.info('🎉 All done! Next steps:');
  log.info('');
  log.info(`  cd ${projectName}`);

  if (skipInstall) {
    log.info(`  npm install`);
  }

  log.info(`  npm run dev`);
  log.info('');
  log.info('Happy coding! 🔥');
}

/**
 * Validate project name
 *
 * @param name - Project name to validate
 * @returns True if valid, error message if invalid
 */
export function validateProjectName(name: string): true | string {
  if (!name || name.trim().length === 0) {
    return 'Project name is required';
  }

  if (!/^[a-z0-9-_]+$/i.test(name)) {
    return 'Project name can only contain letters, numbers, hyphens, and underscores';
  }

  if (name.startsWith('.') || name.startsWith('-') || name.startsWith('_')) {
    return 'Project name cannot start with a dot, hyphen, or underscore';
  }

  if (name.length > 214) {
    return 'Project name is too long (max 214 characters)';
  }

  return true;
}
