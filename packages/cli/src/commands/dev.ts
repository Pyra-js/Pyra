import path from "node:path";
import { log, loadConfig, getPort, findAvailablePort } from "pyrajs-shared";
import { DevServer } from "pyrajs-core";
import { createReactAdapter } from "pyrajs-adapter-react";
import { getVersion } from "../utils/reporter.js";
import { printDevBanner, detectCapabilities } from "../utils/dev-banner.js";
import { setupKeyboardShortcuts } from "../utils/keyboard.js";

export interface DevOptions {
  port?: string;
  open?: boolean;
  config?: string;
  mode?: string;
  verbose?: boolean;
  silent: boolean;
  color: boolean;
}

export async function devCommand(options: DevOptions): Promise<void> {
  const caps = detectCapabilities();
  let requestedPort: number | undefined;

  try {
    const config = await loadConfig({
      mode: options.mode,
      configFile: options.config,
      silent: !options.verbose,
    });

    requestedPort = options.port ? parseInt(options.port, 10) : getPort(config);

    const root = config.root || process.cwd();
    const adapter = createReactAdapter();
    const routesDir = path.resolve(root, config.routesDir || "src/routes");

    const actualPort = await findAvailablePort(requestedPort);

    const server = new DevServer({
      port: actualPort,
      root,
      config,
      adapter,
      routesDir,
    });
    const result = await server.start();

    if (actualPort !== requestedPort) {
      result.warnings.unshift(
        `Port ${requestedPort} in use, using ${actualPort}`,
      );
    }

    printDevBanner({
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
            color: options.color,
            silent: options.silent,
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
        color: options.color,
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
}
