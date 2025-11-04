import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '@pyra/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type Template = 'vanilla' | 'react';
export type Language = 'typescript' | 'javascript';

export interface ScaffoldOptions {
  projectName: string;
  template: Template;
  language: Language;
  targetDir?: string;
}

/**
 * Get the template directory name based on template and language
 */
function getTemplateName(template: Template, language: Language): string {
  const langSuffix = language === 'typescript' ? 'ts' : 'js';
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
  return content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
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
export function scaffold(options: ScaffoldOptions): void {
  const { projectName, template, language, targetDir } = options;

  // Determine target directory
  const projectDir = targetDir || path.join(process.cwd(), projectName);

  // Check if directory already exists
  if (fs.existsSync(projectDir)) {
    const files = fs.readdirSync(projectDir);
    if (files.length > 0) {
      throw new Error(`Directory ${projectName} already exists and is not empty`);
    }
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
  log.success(`Project created at ${projectDir}`);
  log.info('');
  log.info('Next steps:');
  log.info(`cd ${projectName}`);
  log.info('pnpm install (or npm install / yarn install)');
  log.info('pnpm dev');
  log.info('');
}

