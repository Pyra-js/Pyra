/**
 * Tailwind CSS Setup Utility
 *
 * Handles automatic Tailwind CSS configuration for Pyra projects
 */

import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { log } from 'pyrajs-shared';
import { spawnPM, type PM } from '../pm.js';

export type TailwindPreset = 'basic' | 'shadcn';
export type Framework = 'vanilla' | 'react' | 'vue' | 'svelte';

export interface TailwindOptions {
  projectDir: string;
  pm: PM;
  preset: TailwindPreset;
  framework: Framework;
  language: 'typescript' | 'javascript';
  skipInstall?: boolean;
}

/**
 * Generate tailwind.config.js content
 */
function generateTailwindConfig(preset: TailwindPreset, framework: Framework): string {
  const contentPaths: string[] = [];

  // Add framework-specific content paths
  switch (framework) {
    case 'react':
      contentPaths.push('./index.html', './src/**/*.{js,ts,jsx,tsx}');
      break;
    case 'vue':
      contentPaths.push('./index.html', './src/**/*.{vue,js,ts,jsx,tsx}');
      break;
    case 'svelte':
      contentPaths.push('./index.html', './src/**/*.{svelte,js,ts,jsx,tsx}');
      break;
    case 'vanilla':
    default:
      contentPaths.push('./index.html', './src/**/*.{js,ts}');
      break;
  }

  if (preset === 'shadcn') {
    // shadcn/ui preset with custom theme
    return `/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ${JSON.stringify(contentPaths, null, 2)},
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
}
`;
  }

  // Basic preset
  return `/** @type {import('tailwindcss').Config} */
export default {
  content: ${JSON.stringify(contentPaths, null, 2)},
  theme: {
    extend: {},
  },
  plugins: [],
}
`;
}

/**
 * Generate postcss.config.js content
 */
function generatePostCSSConfig(): string {
  return `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`;
}

/**
 * Generate base Tailwind CSS file
 */
function generateTailwindCSS(preset: TailwindPreset): string {
  const base = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

  if (preset === 'shadcn') {
    return `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`;
  }

  return base;
}

/**
 * Inject CSS import into entry file
 */
function injectCSSImport(projectDir: string, framework: Framework, language: 'typescript' | 'javascript'): void {
  const extensions = language === 'typescript' ? ['tsx', 'ts'] : ['jsx', 'js'];
  const possibleEntries: string[] = [];

  // Determine entry file based on framework
  switch (framework) {
    case 'react':
      possibleEntries.push(
        join(projectDir, `src/main.${extensions[0]}`),
        join(projectDir, `src/index.${extensions[0]}`),
      );
      break;
    case 'vue':
      possibleEntries.push(
        join(projectDir, `src/main.${extensions[1]}`),
      );
      break;
    case 'svelte':
      possibleEntries.push(
        join(projectDir, `src/main.${extensions[1]}`),
      );
      break;
    case 'vanilla':
    default:
      possibleEntries.push(
        join(projectDir, `src/index.${extensions[1]}`),
        join(projectDir, `src/main.${extensions[1]}`),
      );
      break;
  }

  // Find the entry file
  let entryFile: string | null = null;
  for (const file of possibleEntries) {
    if (existsSync(file)) {
      entryFile = file;
      break;
    }
  }

  if (!entryFile) {
    log.warn('Could not find entry file to inject CSS import');
    log.warn('Please manually add: import "./index.css" to your entry file');
    return;
  }

  // Read the file
  const content = readFileSync(entryFile, 'utf-8');

  // Check if CSS import already exists
  if (content.includes('import "./index.css"') || content.includes('import \'./index.css\'')) {
    return; // Already imported
  }

  // Add import at the top
  const cssImport = 'import "./index.css";\n';
  const newContent = cssImport + content;

  // Write back
  writeFileSync(entryFile, newContent, 'utf-8');
}

/**
 * Add Tailwind CSS dependencies to package.json
 */
function updatePackageJson(projectDir: string, preset: TailwindPreset): void {
  const pkgPath = join(projectDir, 'package.json');

  if (!existsSync(pkgPath)) {
    log.warn('package.json not found, skipping dependency update');
    return;
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

  // Add Tailwind dependencies
  pkg.devDependencies = pkg.devDependencies || {};
  pkg.devDependencies.tailwindcss = '^3.4.1';
  pkg.devDependencies.postcss = '^8.4.35';
  pkg.devDependencies.autoprefixer = '^10.4.17';

  // Add shadcn utilities
  if (preset === 'shadcn') {
    pkg.dependencies = pkg.dependencies || {};
    pkg.dependencies.clsx = '^2.1.0';
    pkg.dependencies['tailwind-merge'] = '^2.2.1';
  }

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
}

/**
 * Add Tailwind CSS to a Pyra project
 */
export async function addTailwind(options: TailwindOptions): Promise<void> {
  const {
    projectDir,
    pm,
    preset,
    framework,
    language,
    skipInstall = false,
  } = options;

  log.info('');
  log.info('Setting up Tailwind CSS...');

  try {
    // 1. Generate tailwind.config.js
    const tailwindConfigPath = join(projectDir, 'tailwind.config.js');
    const tailwindConfig = generateTailwindConfig(preset, framework);
    writeFileSync(tailwindConfigPath, tailwindConfig, 'utf-8');
    log.success('✓ Created tailwind.config.js');

    // 2. Generate postcss.config.js
    const postcssConfigPath = join(projectDir, 'postcss.config.js');
    const postcssConfig = generatePostCSSConfig();
    writeFileSync(postcssConfigPath, postcssConfig, 'utf-8');
    log.success('✓ Created postcss.config.js');

    // 3. Generate CSS file
    const cssPath = join(projectDir, 'src/index.css');
    const cssContent = generateTailwindCSS(preset);
    writeFileSync(cssPath, cssContent, 'utf-8');
    log.success('✓ Created src/index.css');

    // 4. Inject CSS import into entry file
    injectCSSImport(projectDir, framework, language);
    log.success('✓ Added CSS import to entry file');

    // 5. Update package.json with dependencies
    updatePackageJson(projectDir, preset);
    log.success('✓ Updated package.json');

    // 6. Install dependencies
    if (!skipInstall) {
      log.info('');
      log.info('Installing Tailwind CSS dependencies...');

      const deps = ['tailwindcss', 'postcss', 'autoprefixer'];
      if (preset === 'shadcn') {
        deps.push('clsx', 'tailwind-merge');
      }

      await spawnPM(pm, ['install'], { cwd: projectDir });
      log.success('✓ Dependencies installed');
    }

    log.info('');
    log.success('✓ Tailwind CSS configured successfully');

    if (preset === 'shadcn') {
      log.info('');
      log.info('📚 shadcn/ui preset includes:');
      log.info('  • Custom design tokens (colors, radius, etc.)');
      log.info('  • Dark mode support');
      log.info('  • clsx and tailwind-merge utilities');
    }

  } catch (error) {
    log.error(`Failed to set up Tailwind CSS: ${error}`);
    throw error;
  }
}
