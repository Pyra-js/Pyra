import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { input, select, confirm } from "@inquirer/prompts";
import pc from "picocolors";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOGO = `
██████╗ ██╗   ██╗██████╗  █████╗
██╔══██╗╚██╗ ██╔╝██╔══██╗██╔══██╗
██████╔╝ ╚████╔╝ ██████╔╝███████║
██╔═══╝   ╚██╔╝  ██╔══██╗██╔══██║
██║        ██║   ██║  ██║██║  ██║
╚═╝        ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝
`;

// Logger
const log = {
  info: (msg: string) => console.log(`${pc.cyan("[pyra]")} ${msg}`),
  success: (msg: string) => console.log(`${pc.green("[pyra]")} ${msg}`),
  warn: (msg: string) => console.warn(`${pc.yellow("[pyra]")} ${msg}`),
  error: (msg: string) => console.error(`${pc.red("[pyra]")} ${msg}`),
};

// Version
const require = createRequire(import.meta.url);
const pkg = require("../package.json");
const VERSION: string = pkg.version;

// Types
type PMName = "npm" | "pnpm" | "yarn" | "bun";
type Framework = "vanilla" | "react";
type Language = "typescript" | "javascript";
type TailwindPreset = "none" | "basic" | "shadcn";

interface CliArgs {
  projectName?: string;
  pm?: PMName;
  skipInstall: boolean;
}

// Arg parsing
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

// PM detection
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

// Validation
function validateProjectName(name: string): true | string {
  if (!name || name.trim().length === 0) return "Project name is required";
  if (!/^[a-z0-9-_]+$/i.test(name))
    return "Project name can only contain letters, numbers, hyphens, and underscores";
  if (name.startsWith(".") || name.startsWith("-") || name.startsWith("_"))
    return "Project name cannot start with a dot, hyphen, or underscore";
  if (name.length > 214) return "Project name is too long (max 214 characters)";
  return true;
}

// ── Template copying ─────────────────────────────────────────────────

function copyTemplate(
  framework: Framework,
  language: Language,
  projectDir: string,
  projectName: string,
): void {
  const lang = language === "typescript" ? "ts" : "js";
  const templateName = `template-${framework}-${lang}`;
  const templateDir = resolve(__dirname, "..", templateName);

  if (!existsSync(templateDir)) {
    throw new Error(`Template "${templateName}" not found at ${templateDir}`);
  }

  copyDir(templateDir, projectDir, projectName, "");
}

function copyDir(
  srcDir: string,
  destDir: string,
  projectName: string,
  relPath: string,
): void {
  mkdirSync(destDir, { recursive: true });

  for (const file of readdirSync(srcDir)) {
    const srcPath = join(srcDir, file);
    const destFile = file === "_gitignore" ? ".gitignore" : file;
    const destPath = join(destDir, destFile);
    const rel = relPath ? `${relPath}/${destFile}` : destFile;

    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath, projectName, rel);
    } else {
      let content = readFileSync(srcPath, "utf-8");
      content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
      content = content.replace(/\{\{PYRA_VERSION\}\}/g, VERSION);
      writeFileSync(destPath, content);
      log.success(rel);
    }
  }
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

function addTailwindToPackageJson(
  projectDir: string,
  preset: TailwindPreset,
): void {
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
  const {
    projectName: nameArg,
    pm: pmOverride,
    skipInstall,
  } = parseArgs(process.argv);

  // Banner
  console.log();
  console.log(`${pc.red(LOGO)}`);
  console.log("Next-gen full-stack framework.");
  console.log(
    `${pc.bold(pc.red("Pyra"))} ${pc.dim(`v${VERSION}`)} ${pc.dim("- create a new project")}`,
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
      {
        name: `shadcn ${pc.dim("(design tokens + dark mode)")}`,
        value: "shadcn" as TailwindPreset,
      },
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
  copyTemplate(framework, language, projectDir, projectName);
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
