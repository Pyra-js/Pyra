import path from "node:path";
import { log } from "pyrajs-shared";
import { select, confirm } from "@inquirer/prompts";
import {
  scaffold,
  validateProjectName,
  type Template,
  type Language,
  type AppMode,
} from "../scaffold.js";
import {
  startTimer,
  printBanner,
  printDone,
} from "../utils/reporter.js";
import type { TailwindPreset } from "../utils/tailwind.js";

export interface InitOptions {
  template?: string;
  mode?: string;
  language?: string;
  pm?: string;
  tailwind?: boolean;
  noTailwind?: boolean;
  ui?: string;
  skipInstall?: boolean;
  force?: boolean;
  silent: boolean;
  color: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  if (!options.silent) {
    printBanner({ silent: options.silent, color: options.color });
    console.log("");
  }

  const stop = startTimer();

  try {
    const cwd = process.cwd();
    const projectName = path.basename(cwd);

    const nameValidation = validateProjectName(projectName);
    if (nameValidation !== true) {
      log.error(
        `Current directory name "${projectName}" is not a valid project name: ${nameValidation}`,
      );
      log.error(
        'Rename the directory or use "npm create pyra" to create a new project.',
      );
      process.exit(1);
    }

    const template: Template =
      (options.template as Template | undefined) ||
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
              description:
                "Server-side rendering with file-based routing — requires a server",
            },
            {
              name: "Frontend (SPA)",
              value: "spa",
              description:
                "Client-side only — deploy anywhere (CDN, GitHub Pages, etc.)",
            },
          ],
        }));
    }

    const language: Language =
      (options.language as Language | undefined) ||
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

    let addTailwind = false;
    let tailwindPreset: TailwindPreset = "basic";

    if (options.tailwind === true) {
      addTailwind = true;
    } else if (options.tailwind === false || options.noTailwind === true) {
      addTailwind = false;
    } else {
      addTailwind = await confirm({
        message: "Add Tailwind CSS?",
        default: false,
      });
    }

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

    if (!options.silent) {
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

      printDone({
        verb: "completed",
        elapsedMs: stop(),
        silent: options.silent,
        color: options.color,
      });
    }
  } catch (error) {
    if (error instanceof Error) {
      log.error(`Failed to initialize project: ${error.message}`);
    } else {
      log.error("Failed to initialize project");
    }
    process.exit(1);
  }
}
