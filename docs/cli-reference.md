# CLI Reference

Every command available in the Pyra CLI.

---

## Overview

The Pyra CLI is how you develop, build, and run your Pyra apps. It's provided by the `@pyra/cli` package and exposes the `pyra` command.

```bash
# If installed globally
pyra <command>

# Or via npx
npx pyra <command>

# Or via your package manager's scripts (in package.json)
npm run dev    # runs "pyra dev"
npm run build  # runs "pyra build"
npm run start  # runs "pyra start"
```

Run `pyra --help` to see all available commands. Run `pyra <command> --help` for details on a specific command.

---

## Development

### `pyra dev`

Start a development server with hot module replacement (HMR). This is where you spend most of your time while building your app. The server watches your files, recompiles on changes, and pushes updates to the browser instantly without a full page reload.

```bash
pyra dev
```

| Option | Description |
|--------|-------------|
| `-p, --port <number>` | Port to run on (default: 3000) |
| `-o, --open` | Open the browser automatically when the server starts |
| `-c, --config <path>` | Path to a specific config file |
| `--mode <mode>` | Build mode: `development` or `production` (default: `development`) |
| `--verbose` | Show extra output like config loading details |

The dev server:

- Scans your `src/routes/` directory and builds a route table
- Serves pages with server-side rendering
- Runs a WebSocket server for HMR — when you save a file, the browser updates automatically
- Traces every request and logs timing breakdowns in your terminal
- Serves a built-in dashboard at `/_pyra` for inspecting traces and route stats
- Auto-finds an available port if your requested port is already in use

**Keyboard shortcuts** (when running in a terminal):

| Key | Action |
|-----|--------|
| `r` | Restart the server |
| `o` | Open the app in your browser |
| `c` | Clear the terminal |
| `q` | Quit the server |

**Examples:**

```bash
# Start on port 4000 and open the browser
pyra dev --port 4000 --open

# Use a specific config file
pyra dev --config ./config/pyra.config.ts

# See verbose config loading output
pyra dev --verbose
```

---

## Building

### `pyra build`

Build your app for production. This compiles and bundles everything into optimized files ready for deployment. You must run this before `pyra start`.

```bash
pyra build
```

| Option | Description |
|--------|-------------|
| `-o, --out-dir <path>` | Output directory (default: `dist`) |
| `--minify` | Minify the output (default: true in production) |
| `--sourcemap` | Generate sourcemaps |
| `-c, --config <path>` | Path to a specific config file |
| `--mode <mode>` | Build mode (default: `production`) |
| `--silent` | Suppress the banner and timing output |

The build produces three things inside your output directory:

- `dist/client/` — browser-side JavaScript and CSS bundles
- `dist/server/` — server-side rendering bundles
- `dist/manifest.json` — a map of every route to its assets

After building, the CLI prints a report showing each route's bundle size, render mode (SSR or SSG), and gzip estimates. Routes exceeding the size warning threshold are flagged.

**Examples:**

```bash
# Build with sourcemaps
pyra build --sourcemap

# Build to a custom directory
pyra build --out-dir build

# Silent build (useful in CI)
pyra build --silent
```

---

## Production

### `pyra start`

Start the production server. This serves your prebuilt app from the `dist/` directory. You must run `pyra build` first.

```bash
pyra build && pyra start
```

| Option | Description |
|--------|-------------|
| `-p, --port <number>` | Port to run on (default: 3000) |
| `-c, --config <path>` | Path to a specific config file |
| `-d, --dist <path>` | Path to the dist directory (default: `dist`) |
| `--silent` | Suppress the startup banner |

The production server:

- Reads the build manifest to map routes to compiled assets
- Serves static assets with appropriate caching headers
- Handles SSR for server-rendered pages
- Serves prerendered pages as static HTML
- Supports conditional request tracing (configured via `trace.production` in your config)
- Gracefully shuts down on SIGINT/SIGTERM

**Keyboard shortcuts** (when running in a terminal):

| Key | Action |
|-----|--------|
| `o` | Open the app in your browser |
| `c` | Clear the terminal |
| `q` | Quit the server |

**Examples:**

```bash
# Start on a specific port
pyra start --port 8080

# Start from a custom dist directory
pyra start --dist ./build
```

---

## Scaffolding

Pyra offers two ways to create a new project: `create` for a quick start, and `init` for more choices.

### `pyra create [project-name]`

Quick, minimal project setup. Creates a full-stack React project with file-based routing and sensible defaults. No questions asked (except the project name if you don't provide one).

```bash
pyra create my-app
```

| Option | Description |
|--------|-------------|
| `--pm <manager>` | Package manager to use: `npm`, `pnpm`, `yarn`, or `bun` |
| `--skip-install` | Skip automatic dependency installation |
| `--silent` | Suppress output |

If you don't specify a package manager, Pyra detects what you're using based on lockfiles, the `npm_config_user_agent` environment variable, or what's available on your PATH.

**Examples:**

```bash
# Create a project with pnpm
pyra create my-app --pm pnpm

# Create without installing dependencies
pyra create my-app --skip-install
```

You can also use `create-pyra` directly with any package manager:

```bash
npm create pyra my-app
pnpm create pyra my-app
yarn create pyra my-app
bun create pyra my-app
```

### `pyra init [project-name]`

Interactive scaffolding with more choices. Prompts you to pick a template, language, and optional Tailwind CSS setup.

```bash
pyra init my-app
```

| Option | Description |
|--------|-------------|
| `-t, --template <name>` | Project template: `vanilla` or `react` |
| `-l, --language <lang>` | Language: `typescript` or `javascript` |
| `--pm <manager>` | Package manager: `npm`, `pnpm`, `yarn`, or `bun` |
| `--tailwind` | Add Tailwind CSS |
| `--no-tailwind` | Skip Tailwind CSS |
| `--ui <preset>` | Tailwind preset: `basic` or `shadcn` |
| `--skip-install` | Skip dependency installation |
| `--silent` | Suppress output |

If you don't pass flags, the CLI prompts you interactively for each choice.

**Templates:**

- **Vanilla** — a lightweight SPA with no file-based routing. Just an `index.html` and a `src/` directory.
- **React** — a full-stack app with file-based routing, SSR, layouts, and API routes.

**Examples:**

```bash
# Non-interactive: React + TypeScript + Tailwind with shadcn
pyra init my-app --template react --language typescript --tailwind --ui shadcn

# Non-interactive: Vanilla JavaScript, no Tailwind
pyra init my-app --template vanilla --language javascript --no-tailwind
```

### `create` vs `init`

| | `pyra create` | `pyra init` |
|---|---|---|
| Speed | Fast, no prompts (just project name) | Interactive, more choices |
| Template | Always React full-stack | Vanilla or React |
| Language | Always TypeScript | TypeScript or JavaScript |
| Tailwind | Not included | Optional |
| Best for | Getting started quickly | Customizing your setup |

---

## Utilities

### `pyra graph [path]`

Visualize your project's dependency graph. Analyzes `package.json` files and lockfiles to map out how your packages depend on each other. Useful for monorepos and understanding your dependency tree.

```bash
pyra graph
```

| Option | Description |
|--------|-------------|
| `--format <format>` | Output format: `html`, `svg`, `png`, `mermaid`, `dot`, `json` (default: `html`) |
| `--outfile <file>` | Write output to a specific file |
| `--open` / `--no-open` | Open the result in the browser (for HTML format) |
| `--internal-only` | Show only workspace packages |
| `--external-only` | Show only external dependencies |
| `--filter <expr>` | Include only nodes matching a glob or regex |
| `--hide-dev` | Hide devDependencies |
| `--hide-peer` | Hide peerDependencies |
| `--hide-optional` | Hide optionalDependencies |
| `--max-depth <n>` | Limit how deep to follow transitive dependencies |
| `--cycles` | Highlight dependency cycles |
| `--stats` | Include size and metric information |
| `--pm <manager>` | Force a specific package manager for lockfile parsing |
| `--json` | Output raw JSON to stdout |
| `--silent` | Suppress banner and logs |

**Examples:**

```bash
# Open an interactive HTML graph in the browser
pyra graph --open

# Export as Mermaid diagram
pyra graph --format mermaid --outfile deps.mmd

# Show only internal workspace packages with cycle detection
pyra graph --internal-only --cycles

# JSON output for scripting
pyra graph --json > graph.json
```

### `pyra doctor`

Diagnose your project setup. Checks your configuration, scans your routes, and reports any issues it finds. Useful when something isn't working and you're not sure why.

```bash
pyra doctor
```

| Option | Description |
|--------|-------------|
| `-c, --config <path>` | Path to a specific config file |
| `--silent` | Suppress output |

The doctor checks:

- **Project mode** — detects whether your project is a Static SPA, Full-Stack SSR, or misconfigured
- **Config validation** — verifies your config file is valid and loadable
- **Route scanning** — scans your routes directory and reports what it finds (page count, API route count, layout count, middleware count)
- **Setup issues** — flags problems like missing root layout, conflicting routes, or invalid config

**Example output:**

```
Project Mode: Full-Stack SSR
  Routes directory: src/routes
  Adapter: react

Route Stats:
  Pages:      8
  API Routes: 3
  Layouts:    3
  Middleware:  2

Checks:
  [ok]   Config file found: pyra.config.ts
  [ok]   Root layout exists
  [ok]   No route collisions detected
  [warn] No middleware.ts at root level (consider adding logging)
```

---

## Global Options

These options work across multiple commands:

| Option | Description |
|--------|-------------|
| `--silent` | Suppress banners, timing output, and non-essential logs. Also respects the `PYRA_SILENT=1` environment variable. |
| `-c, --config <path>` | Point to a specific config file instead of relying on auto-discovery. |
| `-h, --help` | Show help for any command. |
| `-v, --version` | Show the Pyra CLI version. |

```bash
# Suppress all output (useful in CI pipelines)
PYRA_SILENT=1 pyra build

# Or with the flag
pyra build --silent
```
