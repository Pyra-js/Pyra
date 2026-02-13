# create-pyra

Scaffold a new [Pyra.js](https://github.com/Natejsx/Pyra) project with a single command.

## Usage

```bash
npm create pyra my-app
```

Or with other package managers:

```bash
pnpm create pyra my-app
yarn create pyra my-app
bun create pyra my-app
```

If you omit the project name, you'll be prompted for one interactively.

## What You Get

A ready-to-run full-stack project with React SSR and file-based routing:

```
my-app/
├── package.json
├── pyra.config.ts
├── tsconfig.json
├── .gitignore
└── src/
    └── routes/
        ├── layout.tsx            # Root layout
        ├── page.tsx              # Home page (/)
        ├── about/
        │   └── page.tsx          # About page (/about)
        └── api/
            └── health/
                └── route.ts      # Health check endpoint (GET /api/health)
```

## Options

| Flag | Description |
|------|-------------|
| `--pm <manager>` | Package manager to use (`npm`, `pnpm`, `yarn`, `bun`) |
| `--skip-install` | Skip automatic dependency installation |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

```bash
# Use pnpm and skip install
npm create pyra my-app -- --pm pnpm --skip-install
```

## After Scaffolding

```bash
cd my-app
npm run dev      # Start dev server with HMR
npm run build    # Production build
npm run start    # Start production server
```

## License

MIT
