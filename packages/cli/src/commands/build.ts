import { log, loadConfig, getOutDir } from "pyrajs-shared";
import { build } from "pyrajs-core";
import { createReactAdapter } from "pyrajs-adapter-react";
import { getVersion } from "../utils/reporter.js";
import chalk from "chalk";

export interface BuildOptions {
  outDir?: string;
  minify?: boolean;
  sourcemap?: boolean;
  config?: string;
  mode?: string;
  silent: boolean;
  color: boolean;
}

export async function buildCommand(options: BuildOptions): Promise<void> {
  if (!options.silent) {
    const v = getVersion();
    if (options.color) {
      console.log(
        `\n  ${chalk.bold.red("PYRA")} ${chalk.red(`v${v}`)}  ${chalk.dim("build")}`,
      );
    } else {
      console.log(`\n  PYRA v${v}  build`);
    }
    console.log("");
  }

  try {
    const config = await loadConfig({
      mode: options.mode as "development" | "production" | undefined,
      configFile: options.config,
    });

    const root = config.root || process.cwd();
    const adapter = createReactAdapter();

    const outDir = options.outDir || getOutDir(config);
    const minify = options.minify ?? config.build?.minify ?? true;
    const sourcemap = options.sourcemap ?? config.build?.sourcemap ?? false;

    await build({
      config,
      adapter,
      root,
      outDir,
      minify,
      sourcemap,
      silent: options.silent,
    });
  } catch (error) {
    log.error(`Build failed: ${error}`);
    process.exit(1);
  }
}
