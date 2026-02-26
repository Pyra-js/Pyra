#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import {
  log,
  loadConfig,
  getPort,
  getOutDir,
  findAvailablePort,
} from "pyrajs-shared";
import { DevServer, build, ProdServer } from "pyrajs-core";
import { createReactAdapter } from "pyrajs-adapter-react";
import { select, confirm } from "@inquirer/prompts";
import { scaffold, validateProjectName, type Template, type Language, type AppMode } from "./scaffold.js";
import {
  startTimer,
  printBanner,
  printDone,
  isSilent,
  useColor,
  getVersion,
} from "./utils/reporter.js";
import {
  printDevBanner,
  printProdBanner,
  detectCapabilities,
} from "./utils/dev-banner.js";
import { setupKeyboardShortcuts } from "./utils/keyboard.js";
import type { TailwindPreset } from "./utils/tailwind.js";
import { graphCommand } from "./commands/graph.js";
import { doctorCommand } from "./commands/doctor.js";
import type { OutputFormat } from "./graph/types.js";
import chalk from "chalk";
import pkg from "../../../package.json";

const program = new Command();
const version = pkg.version;

const LOGO = `
██████╗ ██╗   ██╗██████╗  █████╗
██╔══██╗╚██╗ ██╔╝██╔══██╗██╔══██╗
██████╔╝ ╚████╔╝ ██████╔╝███████║
██╔═══╝   ╚██╔╝  ██╔══██╗██╔══██║
██║        ██║   ██║  ██║██║  ██║
╚═╝        ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝
`;

// If no arguments are provided and the user types "pyra", it'll show this as the default
program
  .name("pyra")
  .description(
    chalk.red(`${LOGO}`) +
      chalk.dim(`
Ignite your web stack.
Next-gen full-stack framework.
`),
  )
  .version(`${version}`)
  .action(() => {
    console.log(chalk.red(LOGO))
    console.log(chalk.bold(`Pyra v${version}`));
    console.log("Ignite your web stack.")
    console.log("Next-gen full-stack framework.")
    console.log();
    console.log(chalk.cyan("▶ Run `pyra --help` for all commands\n"));
  });

program
  .command("dev")
  .description("Start development server with hot module replacement")
  .option("-p, --port <number>", "Port to run dev server on")
  .option("-o, --open", "Open browser on server start")
  .option("-c, --config <path>", "Path to config file")
  .option("--mode <mode>", "Build mode (development|production)", "development")
  .option("--verbose", "Show verbose output (config loading, etc.)")
  .action(async (options) => {
    const silent = isSilent(process.argv, process.env);
    const color = useColor(process.argv, process.env);
    const caps = detectCapabilities();

    let requestedPort: number | undefined;

    try {
      // Load configuration (silent by default, verbose with --verbose)
      const config = await loadConfig({
        mode: options.mode,
        configFile: options.config,
        silent: !options.verbose,
      });

      // CLI options override config file
      requestedPort = options.port
        ? parseInt(options.port, 10)
        : getPort(config);

      // v0.2: Set up route-aware SSR with the React adapter
      const root = config.root || process.cwd();
      const adapter = createReactAdapter();
      const routesDir = path.resolve(root, config.routesDir || "src/routes");

      // Auto-find available port
      const actualPort = await findAvailablePort(requestedPort);

      const server = new DevServer({
        port: actualPort,
        root,
        config,
        adapter,
        routesDir,
      });
      const result = await server.start();

      // Add port fallback warning if port changed
      if (actualPort !== requestedPort) {
        result.warnings.unshift(
          `Port ${requestedPort} in use, using ${actualPort}`,
        );
      }

      // Print styled startup banner
      printDevBanner({
        result,
        version: getVersion(),
        color,
        silent,
        ci: caps.isCI,
      });

      // Handle graceful shutdown
      let isShuttingDown = false;

      const shutdown = () => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log("");
        log.info("Shutting down dev server...");

        server
          .stop()
          .then(() => {
            process.exit(0);
          })
          .catch((error) => {
            log.error(`Error during shutdown: ${error}`);
            process.exit(1);
          });
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      // Set up keyboard shortcuts (TTY only, not in CI)
      if (!caps.isCI && process.stdin.isTTY) {
        const localUrl = `${result.protocol}://localhost:${result.port}/`;

        setupKeyboardShortcuts({
          onRestart: async () => {
            log.info("Restarting server...");
            await server.stop();
            const newResult = await server.start();
            printDevBanner({
              result: newResult,
              version: getVersion(),
              color,
              silent,
              ci: false,
            });
          },
          onQuit: () => shutdown(),
          onOpen: () => {
            import("child_process").then(({ exec }) => {
              const cmd =
                process.platform === "win32"
                  ? `start ${localUrl}`
                  : process.platform === "darwin"
                    ? `open ${localUrl}`
                    : `xdg-open ${localUrl}`;
              exec(cmd);
            });
          },
          onClear: () => console.clear(),
          color,
        });
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.message?.includes("No available port found")) {
        log.error(
          `No available port found starting from ${requestedPort ?? 3000}`,
        );
      } else {
        log.error(`Failed to start dev server: ${error}`);
      }
      process.exit(1);
    }
  });

program
  .command("build")
  .description("Build for production with optimizations")
  .option("-o, --out-dir <path>", "Output directory")
  .option("--minify", "Minify output")
  .option("--sourcemap", "Generate sourcemaps")
  .option("-c, --config <path>", "Path to config file")
  .option("--mode <mode>", "Build mode", "production")
  .option("--silent", "Suppress banner and timing output")
  .action(async (options) => {
    const silent = isSilent(process.argv, process.env);
    const color = useColor(process.argv, process.env);

    // Print banner
    if (!silent) {
      printBanner({ silent, color });
      console.log(""); // Add spacing
    }

    const stop = startTimer();

    try {
      // Load configuration
      const config = await loadConfig({
        mode: options.mode,
        configFile: options.config,
      });

      // Resolve root and adapter
      const root = config.root || process.cwd();
      const adapter = createReactAdapter(); // v1.0: React-first

      // CLI options override config file
      const outDir = options.outDir || getOutDir(config);
      const minify = options.minify ?? config.build?.minify ?? true;
      const sourcemap = options.sourcemap ?? config.build?.sourcemap ?? false;

      // Call the build orchestrator
      await build({
        config,
        adapter,
        root,
        outDir,
        minify,
        sourcemap,
        silent,
      });

      // Print completion message
      if (!silent) {
        console.log(""); // Add spacing
        printDone({ verb: "built", elapsedMs: stop(), silent, color });
      }
    } catch (error) {
      log.error(`Build failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command("start")
  .description("Start the production server (requires pyra build first)")
  .option("-p, --port <number>", "Port to run production server on")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --dist <path>", "Path to dist directory (default: dist)")
  .option("--silent", "Suppress banner and timing output")
  .action(async (options) => {
    const silent = isSilent(process.argv, process.env);
    const color = useColor(process.argv, process.env);
    const caps = detectCapabilities();

    try {
      // Load configuration
      const config = await loadConfig({
        mode: "production",
        configFile: options.config,
      });

      // Resolve paths
      const root = config.root || process.cwd();
      const distDir = path.resolve(root, options.dist || getOutDir(config));
      const port = options.port ? parseInt(options.port, 10) : getPort(config);

      // Resolve adapter (v1.0: always React)
      const adapter = createReactAdapter();

      // Create and start the production server
      const server = new ProdServer({
        distDir,
        adapter,
        port,
        config,
      });

      const result = await server.start();

      // Print styled startup banner
      printProdBanner({
        result,
        version: getVersion(),
        color,
        silent,
        ci: caps.isCI,
      });

      // Handle graceful shutdown
      let isShuttingDown = false;

      const shutdown = () => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log("");
        log.info("Graceful shutdown initiated, finishing in-flight requests...");

        server
          .stop()
          .then(() => process.exit(0))
          .catch((error) => {
            log.error(`Error during shutdown: ${error}`);
            process.exit(1);
          });
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      // Set up keyboard shortcuts (TTY only, not in CI)
      if (!caps.isCI && process.stdin.isTTY) {
        const localUrl = `${result.protocol}://localhost:${result.port}/`;

        setupKeyboardShortcuts({
          onRestart: async () => {
            // No restart in production — just print a hint
            log.info(
              "Restart is not available in production. Stop and re-run 'pyra start'.",
            );
          },
          onQuit: () => shutdown(),
          onOpen: () => {
            import("child_process").then(({ exec }) => {
              const cmd =
                process.platform === "win32"
                  ? `start ${localUrl}`
                  : process.platform === "darwin"
                    ? `open ${localUrl}`
                    : `xdg-open ${localUrl}`;
              exec(cmd);
            });
          },
          onClear: () => console.clear(),
          color,
        });
      }
    } catch (error) {
      log.error(`Failed to start production server: ${error}`);
      process.exit(1);
    }
  });

program
  .command("init")
  .description("Initialize a new Pyra.js project in the current directory")
  .option("-t, --template <name>", "Project template (vanilla, react)")
  .option("-m, --mode <mode>", "App mode (spa, ssr) — only applies to React")
  .option("-l, --language <lang>", "Language (typescript, javascript)")
  .option("--pm <manager>", "Package manager to use (npm, pnpm, yarn, bun)")
  .option("--tailwind", "Add Tailwind CSS")
  .option("--no-tailwind", "Skip Tailwind CSS setup")
  .option("--ui <preset>", "Tailwind preset (basic, shadcn)")
  .option("--skip-install", "Skip dependency installation")
  .option("--force", "Scaffold even if directory is not empty")
  .option("--silent", "Suppress banner and timing output")
  .action(async (options) => {
    const silent = isSilent(process.argv, process.env);
    const color = useColor(process.argv, process.env);

    // Print banner
    if (!silent) {
      printBanner({ silent, color });
      console.log(""); // Add spacing
    }

    const stop = startTimer();

    try {
      const cwd = process.cwd();
      const projectName = path.basename(cwd);

      // Validate directory name as a project name
      const nameValidation = validateProjectName(projectName);
      if (nameValidation !== true) {
        log.error(`Current directory name "${projectName}" is not a valid project name: ${nameValidation}`);
        log.error('Rename the directory or use "npm create pyra" to create a new project.');
        process.exit(1);
      }

      // Prompt for template if not provided
      const template: Template =
        options.template ||
        (await select({
          message: "Select a framework:",
          choices: [
            {
              name: "Vanilla",
              value: "vanilla",
              description: "Lightweight vanilla JavaScript/TypeScript",
            },
            {
              name: "React",
              value: "react",
              description: "React with file-based routing",
            },
          ],
        }));

      // Prompt for app mode if React and not provided via --mode
      let appMode: AppMode = "ssr";
      if (template === "react") {
        appMode =
          (options.mode as AppMode | undefined) ||
          (await select({
            message: "Select a rendering mode:",
            choices: [
              {
                name: "Full-stack",
                value: "ssr",
                description: "Server-side rendering with file-based routing — requires a server",
              },
              {
                name: "Frontend (SPA)",
                value: "spa",
                description: "Client-side only — deploy anywhere (CDN, GitHub Pages, etc.)",
              },
            ],
          }));
      }

      // Prompt for language if not provided
      const language: Language =
        options.language ||
        (await select({
          message: "Select a language:",
          choices: [
            {
              name: "TypeScript",
              value: "typescript",
              description: "Type-safe development with TypeScript",
            },
            {
              name: "JavaScript",
              value: "javascript",
              description: "Classic JavaScript",
            },
          ],
        }));

      // Determine if Tailwind should be added
      let addTailwind = false;
      let tailwindPreset: TailwindPreset = "basic";

      // Check explicit flags first
      if (options.tailwind === true) {
        addTailwind = true;
      } else if (options.tailwind === false || options.noTailwind === true) {
        addTailwind = false;
      } else {
        // Prompt user if no explicit flag
        addTailwind = await confirm({
          message: "Add Tailwind CSS?",
          default: false,
        });
      }

      // If Tailwind is enabled, determine preset
      if (addTailwind) {
        if (options.ui) {
          const preset = options.ui.toLowerCase();
          if (preset === "basic" || preset === "shadcn") {
            tailwindPreset = preset as TailwindPreset;
          } else {
            log.warn(`Invalid UI preset: ${options.ui}, using 'basic'`);
            tailwindPreset = "basic";
          }
        } else {
          // Prompt for preset
          tailwindPreset = (await select({
            message: "Select Tailwind preset:",
            choices: [
              {
                name: "Basic",
                value: "basic",
                description: "Standard Tailwind CSS setup",
              },
              {
                name: "shadcn/ui",
                value: "shadcn",
                description: "Tailwind with shadcn/ui design tokens",
              },
            ],
          })) as TailwindPreset;
        }
      }

      // Scaffold into the current directory
      await scaffold({
        projectName,
        template,
        language,
        appMode,
        targetDir: cwd,
        tailwind: addTailwind,
        tailwindPreset,
        skipInstall: options.skipInstall,
        force: options.force,
      });

      // Print next steps
      if (!silent) {
        log.info("");
        log.info("Next steps:");

        if (options.skipInstall) {
          log.info("  pnpm install  (or npm install / yarn install)");
        }

        log.info("  pnpm dev");
        if (template === "react" && appMode === "ssr") {
          log.info("  pnpm build && pnpm start  (production)");
        }
        log.info("");

        printDone({ verb: "completed", elapsedMs: stop(), silent, color });
      }
    } catch (error) {
      if (error instanceof Error) {
        log.error(`Failed to initialize project: ${error.message}`);
      } else {
        log.error("Failed to initialize project");
      }
      process.exit(1);
    }
  });

program
  .command("graph [path]")
  .description("Visualize dependency graph")
  .option("--open", "Open the interactive graph in the browser")
  .option("--no-open", "Do not open the browser (for HTML format)")
  .option(
    "--format <format>",
    "Output format: html | svg | png | mermaid | dot (default: html)",
  )
  .option("--outfile <file>", "Path to write the output")
  .option("--internal-only", "Show only internal workspace packages")
  .option("--external-only", "Show only external dependencies")
  .option("--filter <expr>", "Include nodes matching glob/regex")
  .option("--hide-dev", "Hide devDependencies")
  .option("--hide-peer", "Hide peerDependencies")
  .option("--hide-optional", "Hide optionalDependencies")
  .option("--max-depth <n>", "Limit transitive depth", parseInt)
  .option("--cycles", "Highlight dependency cycles")
  .option("--stats", "Compute size/metrics if available")
  .option("--pm <manager>", "Force package manager detection")
  .option("--json", "Output raw JSON graph to stdout")
  .option("--silent", "Suppress banner/logs")
  .action(async (path, options) => {
    const silent = isSilent(process.argv, process.env);
    const color = useColor(process.argv, process.env);

    if (!silent) {
      printBanner({ silent, color });
      console.log("");
    }

    const stop = startTimer();

    try {
      await graphCommand({
        path,
        open: options.open,
        format: options.format as OutputFormat,
        outfile: options.outfile,
        internalOnly: options.internalOnly,
        externalOnly: options.externalOnly,
        filter: options.filter,
        hideDev: options.hideDev,
        hidePeer: options.hidePeer,
        hideOptional: options.hideOptional,
        maxDepth: options.maxDepth,
        cycles: options.cycles,
        stats: options.stats,
        pm: options.pm,
        json: options.json,
        silent,
      });

      if (!silent && !options.json) {
        console.log("");
        printDone({ verb: "completed", elapsedMs: stop(), silent, color });
      }
    } catch (error) {
      log.error(`Failed to generate graph: ${error}`);
      process.exit(1);
    }
  });

program
  .command("doctor")
  .description("Diagnose your Pyra project setup")
  .option("-c, --config <path>", "Path to config file")
  .option("--silent", "Suppress output")
  .action(async (options) => {
    const silent = isSilent(process.argv, process.env);
    const color = useColor(process.argv, process.env);

    try {
      await doctorCommand({
        config: options.config,
        silent,
        color,
      });
    } catch (error) {
      log.error(`Doctor failed: ${error}`);
      process.exit(1);
    }
  });

program.parse();
