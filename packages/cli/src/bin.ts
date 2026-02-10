#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import { log, loadConfig, getPort, getOutDir, findAvailablePort } from "pyrajs-shared";
import { DevServer, build, ProdServer } from "pyrajs-core";
import { createReactAdapter } from "pyrajs-adapter-react";
import { input, select, confirm } from "@inquirer/prompts";
import { scaffold, type Template, type Language } from "./scaffold.js";
import { initProject, validateProjectName } from "./init.js";
import type { PMName } from "./pm.js";
import {
  startTimer,
  printBanner,
  printDone,
  isSilent,
  useColor,
  getVersion,
} from "./utils/reporter.js";
import { printDevBanner, detectCapabilities } from "./utils/dev-banner.js";
import { setupKeyboardShortcuts } from "./utils/keyboard.js";
import type { TailwindPreset } from "./utils/tailwind.js";
import { graphCommand } from "./commands/graph.js";
import type { OutputFormat } from "./graph/types.js";

const program = new Command();

// If no arguments are provided and the user types "pyra", it'll show this as the default
program
  .name("pyra")
  .description(
    `
██████╗ ██╗   ██╗██████╗  █████╗
██╔══██╗╚██╗ ██╔╝██╔══██╗██╔══██╗
██████╔╝ ╚████╔╝ ██████╔╝███████║
██╔═══╝   ╚██╔╝  ██╔══██╗██╔══██║
██║        ██║   ██║  ██║██║  ██║
╚═╝        ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝

Ignite your web stack.
Next-gen full-stack framework.
`,
  )
  .version("0.4.0");

program
  .command("dev")
  .description("Start development server with hot module replacement")
  .option("-p, --port <number>", "Port to run dev server on")
  .option("-o, --open", "Open browser on server start")
  .option("-c, --config <path>", "Path to config file")
  .option("--mode <mode>", "Build mode (development|production)", "development")
  
  .action(async (options) => {
    try {
      // Load configuration
      const config = await loadConfig({
        mode: options.mode,
        configFile: options.config,
      });

      // CLI options override config file
      const port = options.port ? parseInt(options.port, 10) : getPort(config);
      const open = options.open ?? config.server?.open ?? false;

      log.info(`Starting dev server in ${config.mode} mode...`);

      // v0.2: Set up route-aware SSR with the React adapter
      const root = config.root || process.cwd();
      const adapter = createReactAdapter();
      const routesDir = path.resolve(root, config.routesDir || "src/routes");

      const server = new DevServer({ port, root, adapter, routesDir });

      await server.start();

      // Handle graceful shutdown
      let isShuttingDown = false;

      const shutdown = () => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        log.info("\nShutting down dev server...");

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
    } catch (error) {
      log.error(`Failed to start dev server: ${error}`);
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

    if (!silent) {
      printBanner({ silent, color });
      console.log("");
    }

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

      await server.start();

      // Handle graceful shutdown
      let isShuttingDown = false;

      const shutdown = () => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        log.info("\nShutting down production server...");

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
    } catch (error) {
      log.error(`Failed to start production server: ${error}`);
      process.exit(1);
    }
  });

program
  .command("create [project-name]")
  .description("Create a new Pyra.js project (simple setup)")
  .option("--pm <manager>", "Package manager to use (npm, pnpm, yarn, bun)")
  .option("--skip-install", "Skip dependency installation")
  .option("--silent", "Suppress banner and timing output")
  .action(async (projectNameArg, options) => {
    const silent = isSilent(process.argv, process.env);
    const color = useColor(process.argv, process.env);

    // Print banner
    if (!silent) {
      printBanner({ silent, color });
      console.log(""); // Add spacing
    }

    const stop = startTimer();

    try {
      // Prompt for project name if not provided
      const projectName =
        projectNameArg ||
        (await input({
          message: "Project name:",
          default: "my-pyra-app",
          validate: (value) => {
            const result = validateProjectName(value);
            return result === true ? true : result;
          },
        }));

      // Validate package manager override if provided
      const pmOverride = options.pm as PMName | undefined;
      if (pmOverride && !["npm", "pnpm", "yarn", "bun"].includes(pmOverride)) {
        log.error(`Invalid package manager: ${pmOverride}`);
        log.error("Valid options: npm, pnpm, yarn, bun");
        process.exit(1);
      }

      // Initialize the project
      await initProject({
        projectName: projectName.trim(),
        pm: pmOverride,
        skipInstall: options.skipInstall,
      });

      // Print completion message
      if (!silent) {
        console.log(""); // Add spacing
        printDone({ verb: "completed", elapsedMs: stop(), silent, color });
      }
    } catch (error) {
      if (error instanceof Error) {
        log.error(`Failed to create project: ${error.message}`);
      } else {
        log.error("Failed to create project");
      }
      process.exit(1);
    }
  });

program
  .command("init [project-name]")
  .description("Initialize a new Pyra.js project (with templates)")
  .option("-t, --template <name>", "Project template (vanilla, react)")
  .option("-l, --language <lang>", "Language (typescript, javascript)")
  .option("--pm <manager>", "Package manager to use (npm, pnpm, yarn, bun)")
  .option("--tailwind", "Add Tailwind CSS")
  .option("--no-tailwind", "Skip Tailwind CSS setup")
  .option("--ui <preset>", "Tailwind preset (basic, shadcn)")
  .option("--skip-install", "Skip dependency installation")
  .option("--silent", "Suppress banner and timing output")
  .action(async (projectNameArg, options) => {
    const silent = isSilent(process.argv, process.env);
    const color = useColor(process.argv, process.env);

    // Print banner
    if (!silent) {
      printBanner({ silent, color });
      console.log(""); // Add spacing
    }

    const stop = startTimer();

    try {
      // Prompt for project name if not provided
      const projectName =
        projectNameArg ||
        (await input({
          message: "Project name:",
          default: "my-pyra-app",
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return "Project name is required";
            }
            if (!/^[a-z0-9-_]+$/i.test(value)) {
              return "Project name can only contain letters, numbers, hyphens, and underscores";
            }
            return true;
          },
        }));

      // Prompt for template if not provided
      const template: Template =
        options.template ||
        (await select({
          message: "Select a template:",
          choices: [
            {
              name: "Vanilla",
              value: "vanilla",
              description: "Lightweight vanilla JavaScript/TypeScript",
            },
            {
              name: "React",
              value: "react",
              description: "React with modern hooks",
            },
          ],
        }));

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

      // Scaffold the project
      await scaffold({
        projectName: projectName.trim(),
        template,
        language,
        tailwind: addTailwind,
        tailwindPreset,
        skipInstall: options.skipInstall,
      });

      // Print completion message
      if (!silent) {
        console.log(""); // Add spacing
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


program.parse();
