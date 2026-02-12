import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { input } from "@inquirer/prompts";
import pc from "picocolors";
import { createRequire } from "node:module";

// ── Logger ───────────────────────────────────────────────────────────
const log = {
  info: (msg: string) => console.log(`${pc.cyan("[pyra]")} ${msg}`),
  success: (msg: string) => console.log(`${pc.green("[pyra]")} ${msg}`),
  warn: (msg: string) => console.warn(`${pc.yellow("[pyra]")} ${msg}`),
  error: (msg: string) => console.error(`${pc.red("[pyra]")} ${msg}`),
};

// ── Version ──────────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const pkg = require("../package.json");
const VERSION: string = pkg.version;

// ── Arg parsing ──────────────────────────────────────────────────────
type PMName = "npm" | "pnpm" | "yarn" | "bun";

interface CliArgs {
  projectName?: string;
  pm?: PMName;
  skipInstall: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let projectName: string | undefined;
  let pm: PMName | undefined;
  let skipInstall = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--version" || arg === "-v") {
      console.log(VERSION);
      process.exit(0);
    }

    if (arg === "--pm" && args[i + 1]) {
      const val = args[++i] as PMName;
      if (!["npm", "pnpm", "yarn", "bun"].includes(val)) {
        log.error(`Invalid package manager: ${val}`);
        log.error("Valid options: npm, pnpm, yarn, bun");
        process.exit(1);
      }
      pm = val;
    } else if (arg === "--skip-install") {
      skipInstall = true;
    } else if (!arg.startsWith("-") && !projectName) {
      projectName = arg;
    }
  }

  return { projectName, pm, skipInstall };
}

function printHelp(): void {
  console.log(`
  ${pc.bold("create-pyra")} ${pc.dim(`v${VERSION}`)}

  ${pc.cyan("Usage:")}
    npm create pyra [project-name] [options]
    pnpm create pyra [project-name] [options]
    yarn create pyra [project-name] [options]
    bun create pyra [project-name] [options]

  ${pc.cyan("Options:")}
    --pm <manager>     Package manager to use (npm, pnpm, yarn, bun)
    --skip-install     Skip dependency installation
    -h, --help         Show this help message
    -v, --version      Show version
`);
}

// ── PM detection ─────────────────────────────────────────────────────
// Simplified version of packages/cli/src/pm.ts — detects the package
// manager the user is running `create-pyra` with.

const LOCKFILES: Record<PMName, string> = {
  pnpm: "pnpm-lock.yaml",
  yarn: "yarn.lock",
  bun: "bun.lockb",
  npm: "package-lock.json",
};

function detectFromUserAgent(): PMName | null {
  const ua = process.env.npm_config_user_agent;
  if (!ua) return null;
  const match = ua.match(/^(pnpm|yarn|npm|bun)\//);
  return match ? (match[1] as PMName) : null;
}

function detectFromLockfile(cwd: string): PMName | null {
  for (const [pm, file] of Object.entries(LOCKFILES)) {
    if (existsSync(join(cwd, file))) return pm as PMName;
  }
  return null;
}

async function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      process.platform === "win32" ? "where" : "which",
      [cmd],
      { stdio: "ignore", shell: true },
    );
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function detectPM(cwd: string, override?: PMName): Promise<PMName> {
  if (override) return override;

  // 1. Check how this script was invoked (npm create / pnpm create / etc.)
  const fromUA = detectFromUserAgent();
  if (fromUA) return fromUA;

  // 2. Check lockfiles in target dir (usually none for new projects)
  const fromLock = detectFromLockfile(cwd);
  if (fromLock) return fromLock;

  // 3. Check what's available on PATH
  for (const pm of ["pnpm", "yarn", "bun", "npm"] as PMName[]) {
    if (await commandExists(pm)) return pm;
  }

  return "npm";
}

function spawnPM(pm: PMName, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(pm, args, { cwd, stdio: "inherit", shell: true });
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${pm} exited with code ${code}`)),
    );
    child.on("error", (err) =>
      reject(new Error(`Failed to run ${pm}: ${err.message}`)),
    );
  });
}

// ── Validation ───────────────────────────────────────────────────────

function validateProjectName(name: string): true | string {
  if (!name || name.trim().length === 0) return "Project name is required";
  if (!/^[a-z0-9-_]+$/i.test(name))
    return "Project name can only contain letters, numbers, hyphens, and underscores";
  if (name.startsWith(".") || name.startsWith("-") || name.startsWith("_"))
    return "Project name cannot start with a dot, hyphen, or underscore";
  if (name.length > 214) return "Project name is too long (max 214 characters)";
  return true;
}

// ── File generators ──────────────────────────────────────────────────
// These produce the same files as `pyra create` in packages/cli/src/init.ts

function generatePackageJson(projectName: string): string {
  const content = {
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
      "pyrajs-cli": `^${VERSION}`,
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      typescript: "^5.7.0",
    },
  };
  return JSON.stringify(content, null, 2) + "\n";
}

function generatePyraConfig(): string {
  return `import { defineConfig } from 'pyrajs-shared';

export default defineConfig({
  routesDir: 'src/routes',
});
`;
}

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

function generateHealthRoute(): string {
  return `import type { RequestContext } from 'pyrajs-shared';

export function GET(ctx: RequestContext) {
  return ctx.json({ status: 'ok', timestamp: new Date().toISOString() });
}
`;
}

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

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { projectName: nameArg, pm: pmOverride, skipInstall } = parseArgs(process.argv);

  // Banner
  console.log();
  console.log(
    `  ${pc.bold(pc.red("Pyra"))} ${pc.dim(`v${VERSION}`)} ${pc.dim("— create a new project")}`,
  );
  console.log();

  // Prompt for project name if not provided as argument
  const projectName =
    nameArg ||
    (await input({
      message: "Project name:",
      default: "my-pyra-app",
      validate: (value) => {
        const result = validateProjectName(value);
        return result === true ? true : result;
      },
    }));

  const projectDir = resolve(process.cwd(), projectName);

  // Check if directory exists
  if (existsSync(projectDir)) {
    log.error(`Directory "${projectName}" already exists`);
    process.exit(1);
  }

  log.info(`Creating new Pyra project: ${pc.bold(projectName)}`);
  console.log();

  // Create directory structure
  mkdirSync(projectDir, { recursive: true });
  const routesDir = join(projectDir, "src", "routes");
  const aboutDir = join(routesDir, "about");
  const apiHealthDir = join(routesDir, "api", "health");
  mkdirSync(routesDir, { recursive: true });
  mkdirSync(aboutDir, { recursive: true });
  mkdirSync(apiHealthDir, { recursive: true });

  // Write all project files
  writeFileSync(join(projectDir, "package.json"), generatePackageJson(projectName));
  log.success("package.json");

  writeFileSync(join(projectDir, "pyra.config.ts"), generatePyraConfig());
  log.success("pyra.config.ts");

  writeFileSync(join(projectDir, "tsconfig.json"), generateTsConfig());
  log.success("tsconfig.json");

  writeFileSync(join(routesDir, "layout.tsx"), generateRootLayout(projectName));
  log.success("src/routes/layout.tsx");

  writeFileSync(join(routesDir, "page.tsx"), generateHomePage(projectName));
  log.success("src/routes/page.tsx");

  writeFileSync(join(aboutDir, "page.tsx"), generateAboutPage());
  log.success("src/routes/about/page.tsx");

  writeFileSync(join(apiHealthDir, "route.ts"), generateHealthRoute());
  log.success("src/routes/api/health/route.ts");

  writeFileSync(join(projectDir, ".gitignore"), generateGitignore());
  log.success(".gitignore");

  console.log();

  // Install dependencies
  if (!skipInstall) {
    const pm = await detectPM(projectDir, pmOverride);
    log.info(`Installing dependencies with ${pc.bold(pm)}...`);
    console.log();

    try {
      await spawnPM(pm, ["install"], projectDir);
      console.log();
      log.success("Dependencies installed");
    } catch {
      log.warn("Failed to install dependencies automatically");
      log.warn(`Run ${pc.bold("npm install")} manually in the project directory`);
    }
  }

  // Print next steps
  console.log();
  log.info(pc.bold("Done! Next steps:"));
  console.log();
  console.log(`  ${pc.cyan("cd")} ${projectName}`);
  if (skipInstall) {
    console.log(`  ${pc.cyan("npm")} install`);
  }
  console.log(`  ${pc.cyan("npm run")} dev`);
  console.log();
}

main().catch((err) => {
  // Handle Ctrl+C gracefully (user cancelled a prompt)
  if (err.name === "ExitPromptError") {
    console.log();
    log.info("Cancelled");
    process.exit(0);
  }
  log.error(err.message || err);
  process.exit(1);
});
