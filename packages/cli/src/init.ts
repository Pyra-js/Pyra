import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { log } from "pyrajs-shared";
import { detectPM, spawnPM, type PMName } from "./pm.js";
import cli_pkg from "../package.json";

// Project Initialization Utility - Scaffolds a new full-stack Pyra project

const pkg_version = cli_pkg.version;

export type InitOptions = {
  projectName: string; // Project name (directory name)
  pm?: PMName; // Override package manager detection
  skipInstall?: boolean; // Skip install step
  template?: string; // Project template
};

// Generate package.json content for a full-stack project
function generatePackageJson(projectName: string): string {
  const pkg = {
    name: projectName,
    version: "0.1.0",
    type: "module",
    description: "A full-stack app built with Pyra",
    private: true,
    scripts: {
      dev: "pyra dev",
      build: "pyra build",
      start: "pyra start",
    },
    dependencies: {
      react: "^19.0.0",
      "react-dom": "^19.0.0",
    },
    devDependencies: {
      "pyrajs-cli": `^${pkg_version}`,
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      typescript: "^5.7.0",
    },
  };

  return JSON.stringify(pkg, null, 2) + "\n";
}

// Generate pyra.config.ts content
function generatePyraConfig(): string {
  return `import { defineConfig } from 'pyrajs-shared';

export default defineConfig({
  routesDir: 'src/routes',
});
`;
}

// Generate tsconfig.json content
function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: "ES2020",
      module: "ESNext",
      moduleResolution: "bundler",
      jsx: "react-jsx",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      isolatedModules: true,
    },
    include: ["src"],
  };

  return JSON.stringify(config, null, 2) + "\n";
}

// Generate root layout component
function generateRootLayout(projectName: string): string {
  return `import React from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav style={{ padding: '1rem', borderBottom: '1px solid #eee', display: 'flex', gap: '1rem' }}>
        <a href="/">Home</a>
        <a href="/about">About</a>
      </nav>
      <main style={{ padding: '2rem' }}>
        {children}
      </main>
      <footer style={{ padding: '1rem', borderTop: '1px solid #eee', textAlign: 'center', color: '#999' }}>
        ${projectName} &mdash; built with Pyra.js
      </footer>
    </div>
  );
}
`;
}

// Generate home page component
function generateHomePage(projectName: string): string {
  return `export default function Home() {
  return (
    <div>
      <h1>Welcome to ${projectName}</h1>
      <p>Your full-stack Pyra.js project is ready.</p>
      <p>Edit <code>src/routes/page.tsx</code> to get started.</p>
    </div>
  );
}
`;
}

// Generate about page component (prerendered)
function generateAboutPage(): string {
  return `export const prerender = true;

export default function About() {
  return (
    <div>
      <h1>About</h1>
      <p>This page is statically prerendered at build time.</p>
    </div>
  );
}
`;
}

// Generate health check API route
function generateHealthRoute(): string {
  return `import type { RequestContext } from 'pyrajs-shared';

export function GET(ctx: RequestContext) {
  return ctx.json({ status: 'ok', timestamp: new Date().toISOString() });
}
`;
}

// Generate .gitignore content
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
 * Initialize a new full-stack Pyra project
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
    throw new Error("Project directory already exists");
  }

  log.info(`Creating new Pyra project: ${projectName}`);
  log.info("");

  // 1. Create directories
  mkdirSync(projectDir, { recursive: true });
  log.success("Created directory: " + projectName + "/");

  const routesDir = join(projectDir, "src", "routes");
  const aboutDir = join(routesDir, "about");
  const apiHealthDir = join(routesDir, "api", "health");
  mkdirSync(routesDir, { recursive: true });
  mkdirSync(aboutDir, { recursive: true });
  mkdirSync(apiHealthDir, { recursive: true });
  log.success("Created directory: src/routes/");

  // 2. Write package.json
  writeFileSync(join(projectDir, "package.json"), generatePackageJson(projectName), "utf-8");
  log.success("Created package.json");

  // 3. Write pyra.config.ts
  writeFileSync(join(projectDir, "pyra.config.ts"), generatePyraConfig(), "utf-8");
  log.success("Created pyra.config.ts");

  // 4. Write tsconfig.json
  writeFileSync(join(projectDir, "tsconfig.json"), generateTsConfig(), "utf-8");
  log.success("Created tsconfig.json");

  // 5. Write route files
  writeFileSync(join(routesDir, "layout.tsx"), generateRootLayout(projectName), "utf-8");
  log.success("Created src/routes/layout.tsx");

  writeFileSync(join(routesDir, "page.tsx"), generateHomePage(projectName), "utf-8");
  log.success("Created src/routes/page.tsx");

  writeFileSync(join(aboutDir, "page.tsx"), generateAboutPage(), "utf-8");
  log.success("Created src/routes/about/page.tsx");

  writeFileSync(join(apiHealthDir, "route.ts"), generateHealthRoute(), "utf-8");
  log.success("Created src/routes/api/health/route.ts");

  // 6. Write .gitignore
  writeFileSync(join(projectDir, ".gitignore"), generateGitignore(), "utf-8");
  log.success("Created .gitignore");

  log.info("");
  log.success("Project scaffolded successfully!");
  log.info("");

  // 7. Detect package manager and install dependencies
  if (!skipInstall) {
    log.info("Installing dependencies...");
    log.info("");

    try {
      const pm = await detectPM(projectDir, pmOverride);

      // Run install command
      await spawnPM(pm, ["install"], { cwd: projectDir });

      log.info("");
      log.success("Dependencies installed");
    } catch (error) {
      log.warn("Failed to install dependencies");
      log.warn("Run the install command manually:");
      log.warn("");
      log.warn(`  cd ${projectName}`);
      log.warn(`  npm install`);
    }
  }

  // 8. Show next steps
  log.info("");
  log.info("All done! Next steps:");
  log.info("");
  log.info(`  cd ${projectName}`);

  if (skipInstall) {
    log.info(`  npm install`);
  }

  log.info(`  npm run dev`);
  log.info("");
}

/**
 * Validate project name
 *
 * @param name - Project name to validate
 * @returns True if valid, error message if invalid
 */
export function validateProjectName(name: string): true | string {
  if (!name || name.trim().length === 0) {
    return "Project name is required";
  }

  if (!/^[a-z0-9-_]+$/i.test(name)) {
    return "Project name can only contain letters, numbers, hyphens, and underscores";
  }

  if (name.startsWith(".") || name.startsWith("-") || name.startsWith("_")) {
    return "Project name cannot start with a dot, hyphen, or underscore";
  }

  if (name.length > 214) {
    return "Project name is too long (max 214 characters)";
  }

  return true;
}
