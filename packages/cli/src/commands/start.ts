import path from "node:path";
import { log, loadConfig, getPort, getOutDir } from "pyrajs-shared";
import { ProdServer } from "pyrajs-core";
import { createReactAdapter } from "pyrajs-adapter-react";
import { getVersion } from "../utils/reporter.js";
import { printProdBanner, detectCapabilities } from "../utils/dev-banner.js";
import { setupKeyboardShortcuts } from "../utils/keyboard.js";

export interface StartOptions {
  port?: string;
  config?: string;
  dist?: string;
  silent: boolean;
  color: boolean;
}

export async function startCommand(options: StartOptions): Promise<void> {
  const caps = detectCapabilities();

  try {
    const config = await loadConfig({
      mode: "production",
      configFile: options.config,
    });

    const root = config.root || process.cwd();
    const distDir = path.resolve(root, options.dist || getOutDir(config));
    const port = options.port ? parseInt(options.port, 10) : getPort(config);

    const adapter = createReactAdapter();

    const server = new ProdServer({
      distDir,
      adapter,
      port,
      config,
    });

    const result = await server.start();

    printProdBanner({
      result,
      version: getVersion(),
      color: options.color,
      silent: options.silent,
      ci: caps.isCI,
    });

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

    if (!caps.isCI && process.stdin.isTTY) {
      const localUrl = `${result.protocol}://localhost:${result.port}/`;

      setupKeyboardShortcuts({
        onRestart: async () => {
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
        color: options.color,
      });
    }
  } catch (error) {
    log.error(`Failed to start production server: ${error}`);
    process.exit(1);
  }
}
