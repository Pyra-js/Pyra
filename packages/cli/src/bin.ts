#!/usr/bin/env node
import { Command } from 'commander';
import { log, loadConfig, getPort, getOutDir } from '@pyra/shared';
import { DevServer, build } from '@pyra/core';
import { input, select } from '@inquirer/prompts';
import { scaffold, type Template, type Language } from './scaffold.js';


const program = new Command();

program
  .name('pyra')
  .description('🔥 Pyra.js - Ignite your frontend\nA next-gen build tool for blazing-fast web development')
  .version('0.0.1');

program
  .command('dev')
  .description('Start development server with hot module replacement')
  .option('-p, --port <number>', 'Port to run dev server on')
  .option('-o, --open', 'Open browser on server start')
  .option('-c, --config <path>', 'Path to config file')
  .option('--mode <mode>', 'Build mode (development|production)', 'development')
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

      const server = new DevServer({ port });

      await server.start();

      // Handle graceful shutdown
      let isShuttingDown = false;

      const shutdown = () => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        log.info('\nShutting down dev server...');

        server.stop()
          .then(() => {
            process.exit(0);
          })
          .catch((error) => {
            log.error(`Error during shutdown: ${error}`);
            process.exit(1);
          });
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } catch (error) {
      log.error(`Failed to start dev server: ${error}`);
      process.exit(1);
    }
  });

program
  .command('build')
  .description('Build for production with optimizations')
  .option('-o, --out-dir <path>', 'Output directory')
  .option('--minify', 'Minify output')
  .option('--sourcemap', 'Generate sourcemaps')
  .option('-c, --config <path>', 'Path to config file')
  .option('--mode <mode>', 'Build mode', 'production')
  .action(async (options) => {
    try {
      // Load configuration
      const config = await loadConfig({
        mode: options.mode,
        configFile: options.config,
      });

      // CLI options override config file
      const outDir = options.outDir || getOutDir(config);
      const minify = options.minify ?? config.build?.minify ?? true;
      const sourcemap = options.sourcemap ?? config.build?.sourcemap ?? false;

      // Call the build function
      await build({
        config,
        outDir,
        minify,
        sourcemap,
      });

    } catch (error) {
      log.error(`Build failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command('init [project-name]')
  .description('Initialize a new Pyra.js project')
  .option('-t, --template <name>', 'Project template (vanilla, react)')
  .option('-l, --language <lang>', 'Language (typescript, javascript)')
  .action(async (projectNameArg, options) => {
    try {
      // Prompt for project name if not provided
      const projectName = projectNameArg || await input({
        message: 'Project name:',
        default: 'my-pyra-app',
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Project name is required';
          }
          if (!/^[a-z0-9-_]+$/i.test(value)) {
            return 'Project name can only contain letters, numbers, hyphens, and underscores';
          }
          return true;
        },
      });

      // Prompt for template if not provided
      const template: Template = options.template || await select({
        message: 'Select a template:',
        choices: [
          { name: 'Vanilla', value: 'vanilla', description: 'Lightweight vanilla JavaScript/TypeScript' },
          { name: 'React', value: 'react', description: 'React with modern hooks' },
        ],
      });

      // Prompt for language if not provided
      const language: Language = options.language || await select({
        message: 'Select a language:',
        choices: [
          { name: 'TypeScript', value: 'typescript', description: 'Type-safe development with TypeScript' },
          { name: 'JavaScript', value: 'javascript', description: 'Classic JavaScript' },
        ],
      });

      // Scaffold the project
      scaffold({
        projectName: projectName.trim(),
        template,
        language,
      });

    } catch (error) {
      if (error instanceof Error) {
        log.error(`Failed to initialize project: ${error.message}`);
      } else {
        log.error('Failed to initialize project');
      }
      process.exit(1);
    }
  });

// Show help by default if no command is provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

program.parse();
