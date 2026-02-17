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
import { createRequire } from "node:module";
import { ReadStream } from "node:tty";
import * as prompt from "@clack/prompts";
import pc from "picocolors";
import { S, stepLabel, summaryRow } from "./theme.js";
import { formatFileTree } from "./tree.js";

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

// Version
const require = createRequire(import.meta.url);
const pkg = require("../package.json");
const VERSION: string = pkg.version;

// Types
type PMName = "npm" | "pnpm" | "yarn" | "bun";
type Framework = "vanilla" | "react" | "preact";
type AppMode = "ssr" | "spa";
type Language = "typescript" | "javascript";
type TailwindPreset = "none" | "basic" | "shadcn";

interface CliArgs {
  projectName?: string;
  pm?: PMName;
  skipInstall: boolean;
}

// Arg Parsing
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
        console.error(`${S.error("error")} Invalid package manager: ${val}`);
        console.error("Valid options: npm, pnpm, yarn, bun");
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
  ${S.bold("create-pyra")} ${S.dim(`v${VERSION}`)}

  ${S.accent("Usage:")}
    npm create pyra [project-name] [options]
    pnpm create pyra [project-name] [options]
    yarn create pyra [project-name] [options]
    bun create pyra [project-name] [options]

  ${S.accent("Options:")}
    --pm <manager>     Package manager (npm, pnpm, yarn, bun)
    --skip-install     Skip dependency installation
    -h, --help         Show this help message
    -v, --version      Show version
`);
}

// PM Detection
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
  return new Promise((res) => {
    const child = spawn(
      process.platform === "win32" ? "where" : "which",
      [cmd],
      { stdio: "ignore", shell: true },
    );
    child.on("close", (code) => res(code === 0));
    child.on("error", () => res(false));
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

function spawnPM(
  pm: PMName,
  args: string[],
  cwd: string,
  quiet = false,
): Promise<void> {
  return new Promise((res, reject) => {
    const child = spawn(pm, args, {
      cwd,
      stdio: quiet ? "pipe" : "inherit",
      shell: true,
    });
    child.on("close", (code) =>
      code === 0
        ? res()
        : reject(new Error(`${pm} exited with code ${code}`)),
    );
    child.on("error", (err) =>
      reject(new Error(`Failed to run ${pm}: ${err.message}`)),
    );
  });
}

// Validation
function validateProjectName(name: string): string | undefined {
  if (!name || name.trim().length === 0) return "Project name is required";
  if (!/^[a-z0-9-_]+$/i.test(name))
    return "Only letters, numbers, hyphens, and underscores allowed";
  if (name.startsWith(".") || name.startsWith("-") || name.startsWith("_"))
    return "Cannot start with a dot, hyphen, or underscore";
  if (name.length > 214) return "Too long (max 214 characters)";
  return undefined;
}

// Template Copying
function copyTemplate(
  framework: Framework,
  appMode: AppMode,
  language: Language,
  projectDir: string,
  projectName: string,
): string[] {
  const lang = language === "typescript" ? "ts" : "js";
  const suffix = appMode === "spa" && framework !== "vanilla" ? "-spa" : "";
  const templateName = `template-${framework}${suffix}-${lang}`;
  const templateDir = resolve(__dirname, "..", templateName);

  if (!existsSync(templateDir)) {
    throw new Error(`Template "${templateName}" not found at ${templateDir}`);
  }

  const files: string[] = [];
  copyDir(templateDir, projectDir, projectName, "", files);
  return files;
}

function copyDir(
  srcDir: string,
  destDir: string,
  projectName: string,
  relPath: string,
  files: string[],
): void {
  mkdirSync(destDir, { recursive: true });

  for (const file of readdirSync(srcDir)) {
    const srcPath = join(srcDir, file);
    const destFile = file === "_gitignore" ? ".gitignore" : file;
    const destPath = join(destDir, destFile);
    const rel = relPath ? `${relPath}/${destFile}` : destFile;

    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath, projectName, rel, files);
    } else {
      let content = readFileSync(srcPath, "utf-8");
      content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
      content = content.replace(/\{\{PYRA_VERSION\}\}/g, VERSION);
      writeFileSync(destPath, content);
      files.push(rel);
    }
  }
}

// Tailwind Generators
function generateTailwindConfig(framework: Framework): string {
  const contentPaths =
    framework === "vanilla"
      ? ["./index.html", "./src/**/*.{js,ts}"]
      : ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"];

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
    framework === "vanilla"
      ? ["./index.html", "./src/**/*.{js,ts}"]
      : ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"];

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

function scaffoldTailwind(
  projectDir: string,
  framework: Framework,
  appMode: AppMode,
  lang: Language,
  preset: TailwindPreset,
): string[] {
  if (preset === "none") return [];

  const files: string[] = [];

  const tailwindConfig =
    preset === "shadcn"
      ? generateShadcnTailwindConfig(framework)
      : generateTailwindConfig(framework);

  writeFileSync(join(projectDir, "tailwind.config.js"), tailwindConfig);
  files.push("tailwind.config.js");

  writeFileSync(join(projectDir, "postcss.config.js"), generatePostCSSConfig());
  files.push("postcss.config.js");

  const cssDir = join(projectDir, "src");
  mkdirSync(cssDir, { recursive: true });
  writeFileSync(join(cssDir, "index.css"), generateTailwindCSS(preset));
  files.push("src/index.css");

  // Inject CSS import into the entry file
  const ts = lang === "typescript";
  if (framework === "vanilla") {
    const ext = ts ? "ts" : "js";
    injectCSSImport(join(projectDir, "src", `index.${ext}`));
  } else if (appMode === "spa") {
    const jsxExt = ts ? "tsx" : "jsx";
    injectCSSImport(join(projectDir, "src", `main.${jsxExt}`));
  } else {
    const jsxExt = ts ? "tsx" : "jsx";
    injectCSSImport(join(projectDir, "src", "routes", `layout.${jsxExt}`));
  }

  // Update package.json with tailwind deps
  const pkgPath = join(projectDir, "package.json");
  const pkgJson = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkgJson.devDependencies = pkgJson.devDependencies || {};
  pkgJson.devDependencies.tailwindcss = "^3.4.1";
  pkgJson.devDependencies.postcss = "^8.4.35";
  pkgJson.devDependencies.autoprefixer = "^10.4.17";

  if (preset === "shadcn") {
    pkgJson.dependencies = pkgJson.dependencies || {};
    pkgJson.dependencies.clsx = "^2.1.0";
    pkgJson.dependencies["tailwind-merge"] = "^2.2.1";
  }

  writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + "\n", "utf-8");

  return files;
}

function injectCSSImport(entryFilePath: string): void {
  if (!existsSync(entryFilePath)) return;

  const content = readFileSync(entryFilePath, "utf-8");
  if (
    content.includes('"./index.css"') ||
    content.includes("'./index.css'")
  ) {
    return;
  }

  writeFileSync(entryFilePath, 'import "./index.css";\n' + content, "utf-8");
}

// Display Labels
const FRAMEWORK_LABELS: Record<Framework, string> = {
  vanilla: "Vanilla",
  react: "React",
  preact: "Preact",
};

const MODE_LABELS: Record<AppMode, string> = {
  ssr: "SSR",
  spa: "SPA",
};

const LANGUAGE_LABELS: Record<Language, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
};

const TAILWIND_LABELS: Record<TailwindPreset, string> = {
  none: "None",
  basic: "Basic",
  shadcn: "shadcn",
};

// Cancellation Helper
function onCancel(value: unknown): void {
  if (prompt.isCancel(value)) {
    prompt.cancel("Setup cancelled.");
    process.exit(0);
  }
}

// Main Wizard
async function main(): Promise<void> {
  const {
    projectName: nameArg,
    pm: pmOverride,
    skipInstall,
  } = parseArgs(process.argv);

  // Check for a functional TTY, npm create on Windows/Git Bash spawns
  // through cmd.exe, which can break the TTY file descriptor even though
  // process.stdin.isTTY still reports true. Probe by actually constructing
  let ttyOk = false;
  try {
    if (process.stdin.isTTY) {
      const test = new ReadStream(0);
      test.destroy();
      ttyOk = true;
    }
  } catch {
    // TTY fd is broken, fall through to the error message
  }

  if (!ttyOk) {
    console.log(LOGO);
    console.error(
      `\n  Interactive mode requires a TTY terminal.\n\n` +
      `  This can happen when running via "npm create" on Windows.\n` +
      `  Try one of these instead:\n\n` +
      `    npx create-pyra\n` +
      `    pnpm create pyra\n` +
      `    bunx create-pyra\n`,
    );
    process.exit(1);
  }

  // Intro
  console.log();
  console.log(`${S.brandBold(LOGO)}`)
  prompt.intro(
    `${S.brandBold("Pyra")} ${S.dim(`v${VERSION}`)} ${S.dim("-")} ${S.dim("create a new project")}`,
  );

  // Detect PM early for default selection
  const detectedPM = pmOverride || (await autoDetectPM());

  // Dynamic step count: vanilla skips rendering mode
  let totalSteps = 7;
  let currentStep = 0;

  const next = (label: string) => stepLabel(++currentStep, totalSteps, label);

  // Step 1: Project Name
  let projectName: string;

  if (nameArg) {
    const err = validateProjectName(nameArg);
    if (err) {
      prompt.cancel(err);
      process.exit(1);
    }
    projectName = nameArg;
    prompt.log.step(
      `${next("Project name")}  ${S.accent(projectName)} ${S.dim("(from args)")}`,
    );
  } else {
    const name = await prompt.text({
      message: next("Project name"),
      placeholder: "my-pyra-app",
      defaultValue: "my-pyra-app",
      validate: (v) => validateProjectName(v),
    });
    onCancel(name);
    projectName = name as string;
  }

  const projectDir = resolve(process.cwd(), projectName);

  if (existsSync(projectDir)) {
    prompt.cancel(`Directory "${projectName}" already exists.`);
    process.exit(1);
  }

  // Step 2: Framework
  const framework = (await prompt.select({
    message: next("Framework"),
    options: [
      {
        value: "vanilla" as Framework,
        label: pc.yellow("Vanilla"),
        hint: "no UI framework",
      },
      {
        value: "react" as Framework,
        label: pc.cyan("React"),
        hint: "recommended",
      },
      {
        value: "preact" as Framework,
        label: pc.magenta("Preact"),
        hint: "lightweight alternative",
      },
    ],
  })) as Framework;
  onCancel(framework);

  // Adjust total steps: vanilla has no rendering mode prompt
  if (framework === "vanilla") {
    totalSteps = 6;
  }

  // Step 3: Rendering Mode (React/Preact only)
  let appMode: AppMode = "spa";

  if (framework !== "vanilla") {
    appMode = (await prompt.select({
      message: next("Rendering mode"),
      options: [
        {
          value: "ssr" as AppMode,
          label: pc.green("SSR"),
          hint: "Server-side rendering",
        },
        {
          value: "spa" as AppMode,
          label: pc.yellow("SPA"),
          hint: "single-page application",
        },
      ],
    })) as AppMode;
    onCancel(appMode);
  }

  // Step N: Variant
  const language = (await prompt.select({
    message: next("Variant"),
    options: [
      {
        value: "typescript" as Language,
        label: pc.blue("TypeScript"),
        hint: "type-safe",
      },
      {
        value: "javascript" as Language,
        label: pc.yellow("JavaScript"),
        hint: "classic",
      },
    ],
  })) as Language;
  onCancel(language);

  // Step N: Tailwind
  const tailwind = (await prompt.select({
    message: next("Tailwind CSS"),
    options: [
      { value: "none" as TailwindPreset, label: "No", hint: "skip" },
      {
        value: "basic" as TailwindPreset,
        label: "Basic",
        hint: "standard setup",
      },
      {
        value: "shadcn" as TailwindPreset,
        label: "shadcn",
        hint: "design tokens + dark mode",
      },
    ],
  })) as TailwindPreset;
  onCancel(tailwind);

  // Step N: Package Manager
  let chosenPM: PMName;

  if (pmOverride) {
    chosenPM = pmOverride;
    prompt.log.step(
      `${next("Package manager")}  ${S.accent(chosenPM)} ${S.dim("(from --pm)")}`,
    );
  } else {
    chosenPM = (await prompt.select({
      message: next("Package manager"),
      initialValue: detectedPM,
      options: [
        { value: "npm" as PMName, label: "npm" },
        { value: "pnpm" as PMName, label: "pnpm" },
        { value: "yarn" as PMName, label: "yarn" },
        { value: "bun" as PMName, label: "bun" },
      ],
    })) as PMName;
    onCancel(chosenPM);
  }

  // Step N: Install Dependencies
  let shouldInstall = false;

  if (skipInstall) {
    prompt.log.step(
      `${next("Install dependencies")}  ${S.dim("No")} ${S.dim("(from --skip-install)")}`,
    );
  } else {
    const install = await prompt.confirm({
      message: next("Install dependencies?"),
      initialValue: true,
    });
    onCancel(install);
    shouldInstall = install as boolean;
  }

  // Summary
  const summaryLines = [
    summaryRow("Project", projectName),
    summaryRow("Framework", FRAMEWORK_LABELS[framework]),
    ...(framework !== "vanilla"
      ? [summaryRow("Mode", MODE_LABELS[appMode])]
      : []),
    summaryRow("Variant", LANGUAGE_LABELS[language]),
    summaryRow("Tailwind", TAILWIND_LABELS[tailwind]),
    summaryRow("Package Mgr", chosenPM),
    summaryRow("Install", shouldInstall ? "Yes" : "No"),
  ];

  prompt.note(summaryLines.join("\n"), "Summary");

  // Confirm
  const confirmed = await prompt.confirm({
    message: "Create project?",
  });
  onCancel(confirmed);

  if (!confirmed) {
    prompt.cancel("Setup cancelled.");
    process.exit(0);
  }

  // Scaffold
  const spin = prompt.spinner();
  spin.start("Scaffolding project...");

  mkdirSync(projectDir, { recursive: true });

  const templateFiles = copyTemplate(
    framework,
    appMode,
    language,
    projectDir,
    projectName,
  );

  const tailwindFiles = scaffoldTailwind(
    projectDir,
    framework,
    appMode,
    language,
    tailwind,
  );

  const allFiles = [...templateFiles, ...tailwindFiles];

  spin.stop(S.success("Project scaffolded"));

  // File Tree
  prompt.note(formatFileTree(allFiles), "Project structure");

  // Install Dependencies
  if (shouldInstall) {
    spin.start(`Installing dependencies with ${S.bold(chosenPM)}...`);

    try {
      await spawnPM(chosenPM, ["install"], projectDir, true);
      spin.stop(S.success("Dependencies installed"));
    } catch {
      spin.stop(S.warn("Failed to install dependencies"));
      prompt.log.warn(
        `Run ${S.bold(`${chosenPM} install`)} manually in the project directory`,
      );
    }
  }

  // Outro
  const nextSteps = [
    `cd ${S.accent(projectName)}`,
    ...(!shouldInstall ? [`${S.accent(chosenPM)} install`] : []),
    `${S.accent(`${chosenPM} run`)} dev`,
  ];

  prompt.outro(
    `${S.successBold("Done!")} Next steps:\n\n${nextSteps.map((s) => `  ${s}`).join("\n")}`,
  );
}

// Entry Point
main().catch((err) => {
  if (err.name === "ExitPromptError") {
    console.log();
    prompt.cancel("Cancelled.");
    process.exit(0);
  }

  // Avoid calling prompt.cancel when TTY is unavailable — it would also crash
  if (process.stdin.isTTY) {
    prompt.cancel(err.message || String(err));
  } else {
    console.error(err.message || String(err));
  }
  process.exit(1);
});
