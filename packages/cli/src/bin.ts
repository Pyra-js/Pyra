#!/usr/bin/env node
import { Command } from 'commander';
import { log, loadConfig, getPort } from '@pyra/shared';
import { DevServer } from '@pyra/core';

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

      log.info(`Building for ${config.mode}...`);

      // CLI options override config file
      const outDir = options.outDir || config.build?.outDir || config.outDir || 'dist';
      const minify = options.minify ?? config.build?.minify ?? true;
      const sourcemap = options.sourcemap ?? config.build?.sourcemap ?? false;

      log.info(`Entry: ${config.entry}`);
      log.info(`Output directory: ${outDir}`);
      log.info(`Minify: ${minify}`);
      log.info(`Sourcemap: ${sourcemap}`);
      log.warn('Build not implemented yet - coming soon');
      // TODO: Import and call build from @pyra/core
    } catch (error) {
      log.error(`Build failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize a new Pyra.js project')
  .option('-t, --template <name>', 'Project template (react, vue, svelte, vanilla)', 'vanilla')
  .action((options) => {
    log.info(`Initializing new Pyra.js project with ${options.template} template...`);
    log.warn('Init not implemented yet - coming soon');
    // TODO: Implement project scaffolding
  });

// Show help by default if no command is provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

program.parse();
