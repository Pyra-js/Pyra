#!/usr/bin/env node
import { Command } from "commander";
import { log } from "pyrajs-shared";
import { isSilent, useColor, getVersion } from "./utils/reporter.js";
import { devCommand } from "./commands/dev.js";
import { buildCommand } from "./commands/build.js";
import { startCommand } from "./commands/start.js";
import { initCommand } from "./commands/init.js";
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
    console.log(chalk.red(LOGO));
    console.log(chalk.bold(`Pyra v${version}`));
    console.log("Ignite your web stack.");
    console.log("Next-gen full-stack framework.");
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
    await devCommand({ ...options, silent, color });
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
    await buildCommand({ ...options, silent, color });
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
    await startCommand({ ...options, silent, color });
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
    await initCommand({ ...options, silent, color });
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
  .action(async (graphPath, options) => {
    const silent = isSilent(process.argv, process.env);
    const color = useColor(process.argv, process.env);

    if (!silent) {
      const { printBanner } = await import("./utils/reporter.js");
      printBanner({ silent, color });
      console.log("");
    }

    const { startTimer, printDone } = await import("./utils/reporter.js");
    const stop = startTimer();

    try {
      await graphCommand({
        path: graphPath,
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
      await doctorCommand({ config: options.config, silent, color });
    } catch (error) {
      log.error(`Doctor failed: ${error}`);
      process.exit(1);
    }
  });

program.parse();
