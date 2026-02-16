import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from 'pyrajs-shared';
import { addTailwind, type TailwindPreset } from './utils/tailwind.js';
import { detectPM, type PM } from './pm.js';
import { getVersion } from './utils/reporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type Template = 'vanilla' | 'react';
export type Language = 'typescript' | 'javascript';

export interface ScaffoldOptions {
  projectName: string;
  template: Template;
  language: Language;
  targetDir: string;
  tailwind?: boolean;
  tailwindPreset?: TailwindPreset;
  skipInstall?: boolean;
  force?: boolean;
}

/**
 * Get the template directory name based on template and language
 * React templates use the full-stack variant with file-based routing
 */
function getTemplateName(template: Template, language: Language): string {
  const langSuffix = language === 'typescript' ? 'ts' : 'js';
  if (template === 'react') {
    return `react-${langSuffix}-fullstack`;
  }
  return `${template}-${langSuffix}`;
}

/**
 * Copy directory recursively
 */
function copyDir(src: string, dest: string): void {
  // Create destination directory
  fs.mkdirSync(dest, { recursive: true });

  // Read all files and directories in source
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy directory
      copyDir(srcPath, destPath);
    } else {
      // Copy file
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Replace placeholders in file content
 */
function replacePlaceholders(content: string, projectName: string): string {
  return content
    .replace(/\{\{PROJECT_NAME\}\}/g, projectName)
    .replace(/\{\{PYRA_VERSION\}\}/g, getVersion());
}

/**
 * Process all files in directory to replace placeholders
 */
function processFiles(dir: string, projectName: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recursively process directory
      processFiles(fullPath, projectName);
    } else {
      // Process file if it's a text file
      const ext = path.extname(entry.name);
      const textExtensions = ['.json', '.ts', '.tsx', '.js', '.jsx', '.html', '.css', '.md'];

      if (textExtensions.includes(ext)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const processed = replacePlaceholders(content, projectName);
        fs.writeFileSync(fullPath, processed, 'utf-8');
      }
    }
  }
}

/**
 * Create a .gitignore file
 */
function createGitignore(targetDir: string): void {
  const gitignoreContent = `# Dependencies
node_modules

# Build output
dist
build

# Environment variables
.env
.env.local
.env.*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*
`;

  fs.writeFileSync(path.join(targetDir, '.gitignore'), gitignoreContent, 'utf-8');
}

/**
 * Scaffold a new Pyra.js project
 */
export async function scaffold(options: ScaffoldOptions): Promise<void> {
  const {
    projectName,
    template,
    language,
    targetDir,
    tailwind = false,
    tailwindPreset = 'basic',
    skipInstall = false,
    force = false,
  } = options;

  const projectDir = targetDir;

  // Check if directory exists and is non-empty
  if (fs.existsSync(projectDir)) {
    const files = fs.readdirSync(projectDir);
    const significant = files.filter(
      f => f !== '.git' && f !== '.DS_Store' && f !== 'Thumbs.db'
    );
    if (significant.length > 0 && !force) {
      throw new Error(
        'Directory is not empty. Use --force to scaffold anyway.'
      );
    }
  } else {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  // Get template directory
  const templateName = getTemplateName(template, language);
  const templateDir = path.join(__dirname, '../templates', templateName);

  // Check if template exists
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template ${templateName} not found`);
  }

  log.info(`Creating ${template} project with ${language}...`);

  // Copy template files
  copyDir(templateDir, projectDir);

  // Process files to replace placeholders
  processFiles(projectDir, projectName);

  // Create .gitignore
  createGitignore(projectDir);

  // Success message
  log.success(`Project scaffolded at ${projectDir}`);

  // Add Tailwind CSS if requested
  if (tailwind) {
    try {
      // Detect package manager
      const pm = await detectPM(projectDir);

      await addTailwind({
        projectDir,
        pm,
        preset: tailwindPreset,
        framework: template,
        language,
        skipInstall,
      });
    } catch (error) {
      log.warn('Failed to set up Tailwind CSS');
      log.warn('You can set it up manually later');
    }
  }
}

/**
 * Validate a project name for use in package.json and directory names
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

