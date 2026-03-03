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
import { applyPatches, type SpaRouter } from "./patches.js";

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
      { stdio: "ignore", shell: false },
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
    const isWin = process.platform === "win32";
    const cmd = isWin ? "cmd.exe" : pm;
    const cmdArgs = isWin ? ["/c", pm, ...args] : args;
    const child = spawn(cmd, cmdArgs, {
      cwd,
      stdio: quiet ? "pipe" : "inherit",
      shell: false,
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

function generatePostCSSConfig(): string {
  return `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`;
}

function scaffoldTailwind(
  projectDir: string,
  framework: Framework,
  appMode: AppMode,
  lang: Language,
): string[] {
  const files: string[] = [];

  writeFileSync(join(projectDir, "tailwind.config.js"), generateTailwindConfig(framework));
  files.push("tailwind.config.js");

  writeFileSync(join(projectDir, "postcss.config.js"), generatePostCSSConfig());
  files.push("postcss.config.js");

  const cssContent = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`;
  const cssDir = join(projectDir, "src");
  mkdirSync(cssDir, { recursive: true });
  writeFileSync(join(cssDir, "index.css"), cssContent);
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
  ssr: "Full-stack",
  spa: "Frontend (SPA)",
};

const LANGUAGE_LABELS: Record<Language, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
};

const ROUTER_LABELS: Record<SpaRouter, string> = {
  none: "None",
  "react-router": "React Router v7",
  "tanstack-router": "TanStack Router",
};

function computeTotalSteps(framework: Framework, appMode: AppMode): number {
  if (framework === "vanilla") return 6;          // name fw lang tailwind pm install
  if (framework === "react" && appMode === "spa") return 9; // +mode +router +compiler
  if (framework === "react") return 8;            // +mode +compiler
  return 7;                                       // preact: +mode
}


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

  let totalSteps = 7; // refined after framework + mode are known
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

  // Step 3: Rendering Mode (React/Preact only)
  let appMode: AppMode = "spa";

  if (framework !== "vanilla") {
    appMode = (await prompt.select({
      message: next("Rendering mode"),
      options: [
        {
          value: "ssr" as AppMode,
          label: pc.green("Full-stack"),
          hint: "Server-side rendering",
        },
        {
          value: "spa" as AppMode,
          label: pc.yellow("Frontend (SPA)"),
          hint: "single-page application",
        },
      ],
    })) as AppMode;
    onCancel(appMode);
  }

  // Refine step count now that we know framework + mode
  totalSteps = computeTotalSteps(framework, appMode);

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

  // Step N: Router (React SPA only)
  let spaRouter: SpaRouter = "none";

  if (framework === "react" && appMode === "spa") {
    spaRouter = (await prompt.select({
      message: next("Router"),
      options: [
        {
          value: "none" as SpaRouter,
          label: pc.dim("None"),
          hint: "add one later",
        },
        {
          value: "react-router" as SpaRouter,
          label: pc.cyan("React Router v7"),
          hint: "react-router",
        },
        {
          value: "tanstack-router" as SpaRouter,
          label: pc.green("TanStack Router"),
          hint: "@tanstack/react-router",
        },
      ],
    })) as SpaRouter;
    onCancel(spaRouter);
  }

  // Step N: React Compiler (React only)
  let reactCompiler = false;

  if (framework === "react") {
    reactCompiler = (await prompt.confirm({
      message: next("Enable React Compiler?"),
      initialValue: false,
    })) as boolean;
    onCancel(reactCompiler);
  }

  // Step N: Tailwind
  const tailwind = await prompt.confirm({
    message: next("Add Tailwind CSS?"),
    initialValue: false,
  });
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
    summaryRow("Tailwind", tailwind ? "Yes" : "No"),
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

  const tailwindFiles = tailwind
    ? scaffoldTailwind(projectDir, framework, appMode, language)
    : [];

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
