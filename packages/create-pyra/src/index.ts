import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { input, select, confirm } from "@inquirer/prompts";
import pc from "picocolors";
import { createRequire } from "node:module";

const LOGO = `
██████╗ ██╗   ██╗██████╗  █████╗
██╔══██╗╚██╗ ██╔╝██╔══██╗██╔══██╗
██████╔╝ ╚████╔╝ ██████╔╝███████║
██╔═══╝   ╚██╔╝  ██╔══██╗██╔══██║
██║        ██║   ██║  ██║██║  ██║
╚═╝        ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝
`;

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

// ── Types ────────────────────────────────────────────────────────────
type PMName = "npm" | "pnpm" | "yarn" | "bun";
type Framework = "vanilla" | "react";
type Language = "typescript" | "javascript";
type TailwindPreset = "none" | "basic" | "shadcn";

interface CliArgs {
  projectName?: string;
  pm?: PMName;
  skipInstall: boolean;
}

// ── Arg parsing ──────────────────────────────────────────────────────

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

async function autoDetectPM(): Promise<PMName> {
  const fromUA = detectFromUserAgent();
  if (fromUA) return fromUA;

  const fromLock = detectFromLockfile(process.cwd());
  if (fromLock) return fromLock;

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

// ── File generators: Vanilla ─────────────────────────────────────────

function generateVanillaPackageJson(projectName: string, ts: boolean): string {
  const content: Record<string, unknown> = {
    name: projectName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "pyra dev",
      build: "pyra build",
    },
    devDependencies: ts
      ? { "pyrajs-cli": `^${VERSION}`, typescript: "^5.9.3" }
      : { "pyrajs-cli": `^${VERSION}` },
  };
  return JSON.stringify(content, null, 2) + "\n";
}

function generateVanillaIndexHtml(projectName: string, ts: boolean): string {
  const ext = ts ? "ts" : "js";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName}</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/index.${ext}"></script>
</body>
</html>
`;
}

function generateVanillaPyraConfig(ts: boolean): string {
  const ext = ts ? "ts" : "js";
  return `import { defineConfig } from 'pyrajs-cli';

export default defineConfig({
  entry: 'src/index.${ext}',
  outDir: 'dist',
  port: 3000,
});
`;
}

function generateVanillaTsConfig(): string {
  const config = {
    compilerOptions: {
      target: "ES2020",
      module: "ESNext",
      moduleResolution: "Bundler",
      lib: ["ES2020", "DOM", "DOM.Iterable"],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      noEmit: true,
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"],
  };
  return JSON.stringify(config, null, 2) + "\n";
}

function generateVanillaEntry(ts: boolean): string {
  if (ts) {
    return `import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = \`
  <div class="container">
    <h1>Welcome to Pyra.js!</h1>
    <p>Edit <code>src/index.ts</code> and save to reload.</p>
    <button id="counter">Count: 0</button>
  </div>
\`;

// Simple counter example
const button = document.querySelector<HTMLButtonElement>('#counter')!;
let count = 0;

button.addEventListener('click', () => {
  count++;
  button.textContent = \`Count: \${count}\`;
});
`;
  }

  return `import './style.css';

const app = document.querySelector('#app');

app.innerHTML = \`
  <div class="container">
    <h1>Welcome to Pyra.js!</h1>
    <p>Edit <code>src/index.js</code> and save to reload.</p>
    <button id="counter">Count: 0</button>
  </div>
\`;

// Simple counter example
const button = document.querySelector('#counter');
let count = 0;

button.addEventListener('click', () => {
  count++;
  button.textContent = \`Count: \${count}\`;
});
`;
}

function generateVanillaStyleCSS(): string {
  return `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, Cantarell, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #333;
}

.container {
  background: white;
  padding: 3rem;
  border-radius: 1rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  text-align: center;
  max-width: 500px;
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

p {
  color: #666;
  margin-bottom: 2rem;
  line-height: 1.6;
}

code {
  background: #f4f4f4;
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
  font-family: 'Courier New', monospace;
  color: #667eea;
}

button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 1rem 2rem;
  font-size: 1.1rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

button:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
}

button:active {
  transform: translateY(0);
}
`;
}

// ── File generators: React (Full-Stack) ──────────────────────────────

function generateReactPackageJson(projectName: string, ts: boolean): string {
  const devDeps: Record<string, string> = { "pyrajs-cli": `^${VERSION}` };
  if (ts) {
    devDeps["@types/react"] = "^19.0.0";
    devDeps["@types/react-dom"] = "^19.0.0";
    devDeps["typescript"] = "^5.7.0";
  }

  const content = {
    name: projectName,
    version: "0.1.0",
    private: true,
    type: "module",
    description: "A full-stack app built with Pyra",
    scripts: {
      dev: "pyra dev",
      build: "pyra build",
      start: "pyra start",
    },
    dependencies: {
      react: "^19.0.0",
      "react-dom": "^19.0.0",
    },
    devDependencies: devDeps,
  };
  return JSON.stringify(content, null, 2) + "\n";
}

function generateReactPyraConfig(ts: boolean): string {
  return `import { defineConfig } from 'pyrajs-shared';

export default defineConfig({
  routesDir: 'src/routes',
});
`;
}

function generateReactTsConfig(): string {
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

function generateReactLayout(projectName: string, ts: boolean): string {
  if (ts) {
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

  return `import React from 'react';

export default function RootLayout({ children }) {
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

function generateReactHomePage(projectName: string, ts: boolean): string {
  const ext = ts ? "tsx" : "jsx";
  return `export default function Home() {
  return (
    <div>
      <h1>Welcome to ${projectName}</h1>
      <p>Your full-stack Pyra.js project is ready.</p>
      <p>Edit <code>src/routes/page.${ext}</code> to get started.</p>
    </div>
  );
}
`;
}

function generateReactAboutPage(): string {
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

function generateReactHealthRoute(ts: boolean): string {
  if (ts) {
    return `import type { RequestContext } from 'pyrajs-shared';

export function GET(ctx: RequestContext) {
  return ctx.json({ status: 'ok', timestamp: new Date().toISOString() });
}
`;
  }

  return `export function GET(ctx) {
  return ctx.json({ status: 'ok', timestamp: new Date().toISOString() });
}
`;
}

// ── File generators: Shared ──────────────────────────────────────────

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

// ── Tailwind generators ──────────────────────────────────────────────

function generateTailwindConfig(framework: Framework): string {
  const contentPaths =
    framework === "react"
      ? ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]
      : ["./index.html", "./src/**/*.{js,ts}"];

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

function generateShadcnTailwindConfig(framework: Framework): string {
  const contentPaths =
    framework === "react"
      ? ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]
      : ["./index.html", "./src/**/*.{js,ts}"];

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
    },
  },
  plugins: [],
}
`;
}

function generatePostCSSConfig(): string {
  return `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`;
}

function generateTailwindCSS(preset: TailwindPreset): string {
  if (preset === "shadcn") {
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

  return `@tailwind base;
@tailwind components;
@tailwind utilities;
`;
}

function addTailwindToPackageJson(projectDir: string, preset: TailwindPreset): void {
  const pkgPath = join(projectDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

  pkg.devDependencies = pkg.devDependencies || {};
  pkg.devDependencies.tailwindcss = "^3.4.1";
  pkg.devDependencies.postcss = "^8.4.35";
  pkg.devDependencies.autoprefixer = "^10.4.17";

  if (preset === "shadcn") {
    pkg.dependencies = pkg.dependencies || {};
    pkg.dependencies.clsx = "^2.1.0";
    pkg.dependencies["tailwind-merge"] = "^2.2.1";
  }

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
}

function injectCSSImport(entryFilePath: string): void {
  if (!existsSync(entryFilePath)) return;

  const content = readFileSync(entryFilePath, "utf-8");
  if (content.includes('"./index.css"') || content.includes("'./index.css'")) {
    return;
  }

  writeFileSync(entryFilePath, 'import "./index.css";\n' + content, "utf-8");
}

// ── Scaffolding: write project files ─────────────────────────────────

function scaffoldVanilla(
  projectDir: string,
  projectName: string,
  lang: Language,
): void {
  const ts = lang === "typescript";
  const ext = ts ? "ts" : "js";
  const srcDir = join(projectDir, "src");

  mkdirSync(srcDir, { recursive: true });

  writeFileSync(join(projectDir, "package.json"), generateVanillaPackageJson(projectName, ts));
  log.success("package.json");

  writeFileSync(join(projectDir, "index.html"), generateVanillaIndexHtml(projectName, ts));
  log.success("index.html");

  writeFileSync(join(projectDir, `pyra.config.${ext === "ts" ? "ts" : "js"}`), generateVanillaPyraConfig(ts));
  log.success(`pyra.config.${ext === "ts" ? "ts" : "js"}`);

  if (ts) {
    writeFileSync(join(projectDir, "tsconfig.json"), generateVanillaTsConfig());
    log.success("tsconfig.json");
  }

  writeFileSync(join(srcDir, `index.${ext}`), generateVanillaEntry(ts));
  log.success(`src/index.${ext}`);

  writeFileSync(join(srcDir, "style.css"), generateVanillaStyleCSS());
  log.success("src/style.css");
}

function scaffoldReact(
  projectDir: string,
  projectName: string,
  lang: Language,
): void {
  const ts = lang === "typescript";
  const jsxExt = ts ? "tsx" : "jsx";
  const ext = ts ? "ts" : "js";
  const routesDir = join(projectDir, "src", "routes");
  const aboutDir = join(routesDir, "about");
  const apiHealthDir = join(routesDir, "api", "health");

  mkdirSync(apiHealthDir, { recursive: true });
  mkdirSync(aboutDir, { recursive: true });

  writeFileSync(join(projectDir, "package.json"), generateReactPackageJson(projectName, ts));
  log.success("package.json");

  writeFileSync(join(projectDir, `pyra.config.${ext}`), generateReactPyraConfig(ts));
  log.success(`pyra.config.${ext}`);

  if (ts) {
    writeFileSync(join(projectDir, "tsconfig.json"), generateReactTsConfig());
    log.success("tsconfig.json");
  }

  writeFileSync(join(routesDir, `layout.${jsxExt}`), generateReactLayout(projectName, ts));
  log.success(`src/routes/layout.${jsxExt}`);

  writeFileSync(join(routesDir, `page.${jsxExt}`), generateReactHomePage(projectName, ts));
  log.success(`src/routes/page.${jsxExt}`);

  writeFileSync(join(aboutDir, `page.${jsxExt}`), generateReactAboutPage());
  log.success(`src/routes/about/page.${jsxExt}`);

  writeFileSync(join(apiHealthDir, `route.${ext}`), generateReactHealthRoute(ts));
  log.success(`src/routes/api/health/route.${ext}`);
}

function scaffoldTailwind(
  projectDir: string,
  framework: Framework,
  lang: Language,
  preset: TailwindPreset,
): void {
  if (preset === "none") return;

  console.log();
  log.info("Setting up Tailwind CSS...");

  const tailwindConfig =
    preset === "shadcn"
      ? generateShadcnTailwindConfig(framework)
      : generateTailwindConfig(framework);

  writeFileSync(join(projectDir, "tailwind.config.js"), tailwindConfig);
  log.success("tailwind.config.js");

  writeFileSync(join(projectDir, "postcss.config.js"), generatePostCSSConfig());
  log.success("postcss.config.js");

  const cssDir = join(projectDir, "src");
  mkdirSync(cssDir, { recursive: true });
  writeFileSync(join(cssDir, "index.css"), generateTailwindCSS(preset));
  log.success("src/index.css");

  // Inject CSS import into the entry file
  const ts = lang === "typescript";
  if (framework === "vanilla") {
    const ext = ts ? "ts" : "js";
    injectCSSImport(join(projectDir, "src", `index.${ext}`));
  } else {
    const jsxExt = ts ? "tsx" : "jsx";
    injectCSSImport(join(projectDir, "src", "routes", `layout.${jsxExt}`));
  }

  addTailwindToPackageJson(projectDir, preset);
  log.success("Updated package.json with Tailwind dependencies");
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { projectName: nameArg, pm: pmOverride, skipInstall } = parseArgs(process.argv);

  // Banner
  console.log();
  console.log(`${pc.red(LOGO)}`);
  console.log(
    `  ${pc.bold(pc.red("Pyra"))} ${pc.dim(`v${VERSION}`)} ${pc.dim("- create a new project")}`,
  );
  console.log();

  // 1. Project name
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

  if (existsSync(projectDir)) {
    log.error(`Directory "${projectName}" already exists`);
    process.exit(1);
  }

  // 2. Framework
  const framework = await select<Framework>({
    message: "Select a framework:",
    choices: [
      { name: `${pc.yellow("Vanilla")}`, value: "vanilla" as Framework },
      { name: `${pc.cyan("React")}`, value: "react" as Framework },
    ],
  });

  // 3. Variant
  const language = await select<Language>({
    message: "Select a variant:",
    choices: [
      { name: `${pc.blue("TypeScript")}`, value: "typescript" as Language },
      { name: `${pc.yellow("JavaScript")}`, value: "javascript" as Language },
    ],
  });

  // 4. Tailwind
  const tailwind = await select<TailwindPreset>({
    message: "Add Tailwind CSS?",
    choices: [
      { name: "No", value: "none" as TailwindPreset },
      { name: "Basic", value: "basic" as TailwindPreset },
      { name: `shadcn ${pc.dim("(design tokens + dark mode)")}`, value: "shadcn" as TailwindPreset },
    ],
  });

  // 5. Package manager
  const detectedPM = pmOverride || (await autoDetectPM());
  const pmChoices: { name: string; value: PMName }[] = [
    { name: "npm", value: "npm" },
    { name: "pnpm", value: "pnpm" },
    { name: "yarn", value: "yarn" },
    { name: "bun", value: "bun" },
  ];

  const chosenPM = pmOverride
    ? pmOverride
    : await select<PMName>({
        message: "Package manager:",
        choices: pmChoices,
        default: detectedPM,
      });

  // 6. Install?
  const shouldInstall = skipInstall
    ? false
    : await confirm({
        message: `Install dependencies with ${chosenPM}?`,
        default: true,
      });

  // ── Scaffold ────────────────────────────────────────────────────────
  console.log();
  log.info(`Creating new Pyra project: ${pc.bold(projectName)}`);
  console.log();

  mkdirSync(projectDir, { recursive: true });

  if (framework === "vanilla") {
    scaffoldVanilla(projectDir, projectName, language);
  } else {
    scaffoldReact(projectDir, projectName, language);
  }

  writeFileSync(join(projectDir, ".gitignore"), generateGitignore());
  log.success(".gitignore");

  scaffoldTailwind(projectDir, framework, language, tailwind);

  // ── Install ─────────────────────────────────────────────────────────
  if (shouldInstall) {
    console.log();
    log.info(`Installing dependencies with ${pc.bold(chosenPM)}...`);
    console.log();

    try {
      await spawnPM(chosenPM, ["install"], projectDir);
      console.log();
      log.success("Dependencies installed");
    } catch {
      log.warn("Failed to install dependencies automatically");
      log.warn(
        `Run ${pc.bold(`${chosenPM} install`)} manually in the project directory`,
      );
    }
  }

  // ── Next steps ──────────────────────────────────────────────────────
  console.log();
  log.info(pc.bold("Done! Next steps:"));
  console.log();
  console.log(`  ${pc.cyan("cd")} ${projectName}`);
  if (!shouldInstall) {
    console.log(`  ${pc.cyan(chosenPM)} install`);
  }
  console.log(`  ${pc.cyan(`${chosenPM} run`)} dev`);
  console.log();
}

main().catch((err) => {
  if (err.name === "ExitPromptError") {
    console.log();
    log.info("Cancelled");
    process.exit(0);
  }
  log.error(err.message || err);
  process.exit(1);
});
