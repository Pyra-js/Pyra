import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

export type SpaRouter = "none" | "react-router" | "tanstack-router";
type Language = "typescript" | "javascript";

export interface PatchContext {
  framework: string;
  appMode: string;
  language: Language;
  spaRouter: SpaRouter;
  reactCompiler: boolean;
  projectName: string;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export function applyPatches(projectDir: string, ctx: PatchContext): string[] {
  const newFiles: string[] = [];

  if (ctx.framework === "react" && ctx.appMode === "spa" && ctx.spaRouter !== "none") {
    newFiles.push(...patchRouter(projectDir, ctx));
  }

  if (ctx.framework === "react" && ctx.reactCompiler) {
    patchReactCompiler(projectDir, ctx);
  }

  return newFiles;
}

// ─── Package.json Helper ──────────────────────────────────────────────────────

function patchPackageJson(
  projectDir: string,
  additions: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  },
): void {
  const pkgPath = join(projectDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

  if (additions.dependencies) {
    pkg.dependencies = sortKeys({ ...pkg.dependencies, ...additions.dependencies });
  }
  if (additions.devDependencies) {
    pkg.devDependencies = sortKeys({ ...pkg.devDependencies, ...additions.devDependencies });
  }

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
}

function sortKeys(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

// ─── Router Patching ──────────────────────────────────────────────────────────

function patchRouter(projectDir: string, ctx: PatchContext): string[] {
  const ts = ctx.language === "typescript";
  const ext = ts ? "tsx" : "jsx";
  const newFiles: string[] = [];

  if (ctx.spaRouter === "react-router") {
    newFiles.push(...patchReactRouter(projectDir, ctx.projectName, ts, ext));
  } else if (ctx.spaRouter === "tanstack-router") {
    newFiles.push(...patchTanstackRouter(projectDir, ctx.projectName, ts, ext));
  }

  return newFiles;
}

function patchReactRouter(
  projectDir: string,
  projectName: string,
  ts: boolean,
  ext: string,
): string[] {
  // Rewrite main entry
  const mainContent = ts
    ? `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import App from './App';
import Home from './pages/Home';
import './style.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
    ],
  },
]);

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
`
    : `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import App from './App';
import Home from './pages/Home';
import './style.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
    ],
  },
]);

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
`;

  writeFileSync(join(projectDir, "src", `main.${ext}`), mainContent, "utf-8");

  // Rewrite App as layout shell with <Outlet />
  const appContent = `import { Outlet, Link } from 'react-router';

export default function App() {
  return (
    <div className="container">
      <nav>
        <Link to="/">Home</Link>
      </nav>
      <Outlet />
    </div>
  );
}
`;

  writeFileSync(join(projectDir, "src", `App.${ext}`), appContent, "utf-8");

  // Create src/pages/Home
  const pagesDir = join(projectDir, "src", "pages");
  mkdirSync(pagesDir, { recursive: true });

  const homeContent = `export default function Home() {
  return (
    <div>
      <h1>Welcome to ${projectName}</h1>
      <p>Edit <code>src/pages/Home.${ext}</code> to get started.</p>
    </div>
  );
}
`;

  writeFileSync(join(pagesDir, `Home.${ext}`), homeContent, "utf-8");

  // Add react-router dependency
  patchPackageJson(projectDir, {
    dependencies: { "react-router": "^7.0.0" },
  });

  return [`src/pages/Home.${ext}`];
}

function patchTanstackRouter(
  projectDir: string,
  projectName: string,
  ts: boolean,
  ext: string,
): string[] {
  // TanStack Router is self-contained in main — no App.tsx needed
  const mainContent = ts
    ? `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
  Outlet,
  Link,
} from '@tanstack/react-router';
import './style.css';

const rootRoute = createRootRoute({
  component: () => (
    <div className="container">
      <nav>
        <Link to="/">Home</Link>
      </nav>
      <Outlet />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <div>
      <h1>Welcome to ${projectName}</h1>
      <p>Edit <code>src/main.tsx</code> to get started.</p>
    </div>
  ),
});

const routeTree = rootRoute.addChildren([indexRoute]);
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
`
    : `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
  Outlet,
  Link,
} from '@tanstack/react-router';
import './style.css';

const rootRoute = createRootRoute({
  component: () => (
    <div className="container">
      <nav>
        <Link to="/">Home</Link>
      </nav>
      <Outlet />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <div>
      <h1>Welcome to ${projectName}</h1>
      <p>Edit <code>src/main.jsx</code> to get started.</p>
    </div>
  ),
});

const routeTree = rootRoute.addChildren([indexRoute]);
const router = createRouter({ routeTree });

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
`;

  writeFileSync(join(projectDir, "src", `main.${ext}`), mainContent, "utf-8");

  // Remove App.tsx — router root route replaces it
  const appPath = join(projectDir, "src", `App.${ext}`);
  if (existsSync(appPath)) unlinkSync(appPath);

  // Add @tanstack/react-router dependency
  patchPackageJson(projectDir, {
    dependencies: { "@tanstack/react-router": "^1.0.0" },
  });

  return [];
}

// ─── React Compiler Patching ──────────────────────────────────────────────────

function patchReactCompiler(projectDir: string, ctx: PatchContext): void {
  const ts = ctx.language === "typescript";

  // Add compiler deps to package.json
  patchPackageJson(projectDir, {
    devDependencies: {
      "babel-plugin-react-compiler": "^19.0.0",
      "esbuild-plugin-babel": "^0.2.3",
    },
  });

  // Rewrite pyra.config to include the compiler plugin
  const configExt = ts ? "ts" : "js";
  const configPath = join(projectDir, `pyra.config.${configExt}`);
  if (!existsSync(configPath)) return;

  const isFullstack = ctx.appMode === "ssr";
  const typeAnnotation = ts
    ? "{ addEsbuildPlugin }: { addEsbuildPlugin: (p: unknown) => void }"
    : "{ addEsbuildPlugin }";

  const baseConfig = isFullstack
    ? `  routesDir: 'src/routes',`
    : `  entry: 'src/main.${ts ? "tsx" : "jsx"}',\n  outDir: 'dist',\n  port: 3000,`;

  const config = `import { defineConfig } from '@pyra-js/cli';
import babelPlugin from 'esbuild-plugin-babel';

export default defineConfig({
${baseConfig}
  plugins: [
    {
      name: 'react-compiler',
      setup(${typeAnnotation}) {
        addEsbuildPlugin(babelPlugin({
          filter: /\\.[jt]sx$/,
          config: {
            plugins: [['babel-plugin-react-compiler', { target: '19' }]],
          },
        }));
      },
    },
  ],
});
`;

  writeFileSync(configPath, config, "utf-8");
}
