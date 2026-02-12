# ci docs

For this part:

```md
on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
```

This workflow is the **trigger** and it runs in two situations. When **someone pushes a commit directory to master** or **Someone opens (or updates) a pull request targeting master**.

This means every PR gets a green checkmark or red X before it gets merged.

This part:

```md
build:
    runs-on: ubuntu-latest
```

This is called the **runner** and it spins up a fresh Ubuntu Vm for each run. It's a clean machine every time, no leftover state from previous runs.

On lines 13 - 29 these are just steps.

Step 1 — **actions/checkout@v4**: Clones your repo into the VM. Without this, the runner has an empty filesystem.

Step 2 — **pnpm/action-setup@v4**: Installs pnpm. It reads the
"packageManager": "pnpm@10.17.1" field from your root package.json and installs that exact version, so CI matches your local environment.

Step 3 — **actions/setup-node@v4**: Installs Node.js 18 and enables pnpm's dependency cache. On the first run, pnpm install downloads everything fresh. On subsequent runs, cache: pnpm restores the pnpm store from a previous run so installs are much faster (seconds instead of minutes).

Step 4 — **pnpm install**: Installs all dependencies across the monorepo.

Step 5 — **pnpm typecheck**: Runs tsc -b which type-checks all packages via TypeScript project references. If any package has a type error, this fails and the workflow goes red.

Step 6 — **pnpm build**: Runs pnpm -r --filter ./packages/* run build which builds every package with tsup in dependency order (shared → core → adapter-react → cli → create-pyra). If any package fails to compile, the workflow goes red.
