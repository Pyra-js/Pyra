import * as esbuild from "esbuild";
import { builtinModules } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  log,
  type PyraAdapter,
  type RouteManifest,
  type RenderMode,
  type CacheConfig,
  type PrerenderConfig,
  HTTP_METHODS,
  getOutDir,
} from "pyrajs-shared";
import { resolveRouteRenderMode } from "../render-mode.js";
import { createPostCSSPlugin } from "../css-plugin.js";
import pc from "picocolors";
import { scanRoutes } from "../scanner.js";
import { createRouter } from "../router.js";
import {
  createBuildTimeRequestContext,
  escapeJsonForScript,
} from "../request-context.js";
import { type BuildOrchestratorOptions, type BuildResult } from "../types.js";
import { buildSPA } from "../buildSPA.js";
import { buildEsbuildResolveOptions } from "../bundler.js";
import { routeIdToSafeName } from "./build-utils.js";
import {
  buildClientOutputMap,
  buildClientLayoutOutputMap,
} from "./build-client.js";
import {
  buildServerOutputMap,
  buildServerMwLayoutOutputMap,
} from "./build-server.js";
import {
  assembleManifest,
  buildEmptyManifest,
  DEFAULT_SHELL,
} from "./build-manifest.js";
import { buildPrerenderAssetTags } from "./build-prerender.js";
import { printBuildReport } from "./build-report.js";

/**
 * Build for production.
 *
 * Scans the routes directory, runs separate client and server esbuild passes,
 * generates dist/manifest.json mapping routes to assets, and prints a build
 * report table.
 */
export async function build(
  options: BuildOrchestratorOptions,
): Promise<BuildResult> {
  const startTime = performance.now();

  // Resolve defaults
  const root = options.root || options.config.root || process.cwd();
  const outDir = path.resolve(
    root,
    options.outDir || getOutDir(options.config) || "dist",
  );
  const base = options.config.build?.base || "/";
  const minify = options.minify ?? options.config.build?.minify ?? true;
  const sourcemap =
    options.sourcemap ?? options.config.build?.sourcemap ?? false;
  const routesDir = path.resolve(
    root,
    options.config.routesDir || "src/routes",
  );
  const containerId = options.config.appContainerId || "app";
  const adapter = options.adapter;
  const silent = options.silent ?? false;

  // SPA build: fall back when there is no routes directory on disk.
  if (!fs.existsSync(routesDir)) {
    return buildSPA(options);
  }

  // Plugin: config() hooks
  const plugins = options.config.plugins ?? [];
  let resolvedConfig = options.config;
  for (const plugin of plugins) {
    resolvedConfig =
      (await plugin.config?.(resolvedConfig, "production")) ?? resolvedConfig;
  }
  // Propagate plugin setup (mode + config access)
  for (const plugin of plugins) {
    await plugin.setup?.({
      addEsbuildPlugin: () => {},
      getConfig: () => resolvedConfig,
      getMode: () => "production",
    });
  }

  const clientOutDir = path.join(outDir, "client", "assets");
  const serverOutDir = path.join(outDir, "server");

  // Clean output directory
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(clientOutDir, { recursive: true });
  fs.mkdirSync(serverOutDir, { recursive: true });

  // Plugin: buildStart() hooks
  for (const plugin of plugins) {
    await plugin.buildStart?.();
  }

  // Scan routes
  const scanResult = await scanRoutes(routesDir, [...adapter.fileExtensions]);
  const router = createRouter(scanResult);
  const pageRoutes = router.pageRoutes();
  const apiRoutes = router.apiRoutes();

  if (!silent) {
    const pg = pageRoutes.length;
    const api = apiRoutes.length;
    const pgStr = `${pg} page${pg !== 1 ? "s" : ""}`;
    const apiStr = api > 0 ? ` · ${api} API` : "";
    console.log(`  ${pc.green("\u2713")}  ${pgStr + apiStr}`);
  }

  if (pageRoutes.length === 0 && apiRoutes.length === 0) {
    log.warn("No routes found. Nothing to build.");
    const manifest = buildEmptyManifest(
      adapter.name,
      base,
      options.config.renderMode,
    );
    fs.writeFileSync(
      path.join(outDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );
    return {
      manifest,
      clientOutputCount: 0,
      serverOutputCount: 0,
      totalDurationMs: performance.now() - startTime,
    };
  }

  // Generate client entry wrappers
  const buildTmpDir = path.join(root, ".pyra", "build", "client-entries");
  fs.mkdirSync(buildTmpDir, { recursive: true });

  const clientEntryMap = new Map<string, string>(); // routeId → temp entry file path
  const clientEntryPoints: Record<string, string> = {};

  for (const route of pageRoutes) {
    const safeName = routeIdToSafeName(route.id);
    const entryPath = path.join(buildTmpDir, `${safeName}.tsx`);

    // Compute relative import path from temp entry to actual page file
    let relImport = path
      .relative(buildTmpDir, route.filePath)
      .split(path.sep)
      .join("/");
    if (!relImport.startsWith(".")) {
      relImport = "./" + relImport;
    }

    // Use adapter's getHydrationScript to generate the wrapper content.
    const code = adapter.getHydrationScript(relImport, containerId);
    fs.writeFileSync(entryPath, code, "utf-8");

    clientEntryMap.set(route.id, entryPath);
    clientEntryPoints[safeName] = entryPath;
  }

  // Add layout files to client build (raw modules for client-side import)
  const clientLayoutMap = new Map<string, string>(); // layoutId → client entry file path
  for (const layout of scanResult.layouts) {
    const safeName = "layout__" + routeIdToSafeName(layout.id);
    clientEntryPoints[safeName] = layout.filePath;
    clientLayoutMap.set(layout.id, layout.filePath);
  }

  // Add error boundary files to client build
  const clientErrorMap = new Map<string, string>(); // dirId → client entry file path
  for (const err of scanResult.errors) {
    const safeName = "error__" + routeIdToSafeName(err.dirId);
    clientEntryPoints[safeName] = err.filePath;
    clientErrorMap.set(err.dirId, err.filePath);
  }

  // Add 404 page to client build
  if (scanResult.notFoundPage) {
    clientEntryPoints["page__404"] = scanResult.notFoundPage;
  }

  // Client build
  const clientResult = await esbuild.build({
    entryPoints: clientEntryPoints,
    bundle: true,
    minify,
    sourcemap,
    outdir: clientOutDir,
    format: "esm",
    platform: "browser",
    target: options.config.build?.target || "es2020",
    splitting: options.config.build?.splitting ?? true,
    metafile: true,
    entryNames: "[name]-[hash]",
    chunkNames: "chunk-[hash]",
    assetNames: "[name]-[hash]",
    jsx: "automatic",
    jsxImportSource: "react",
    plugins: [createPostCSSPlugin(root), ...adapter.esbuildPlugins()],
    absWorkingDir: root,
    logLevel: "silent",
    loader: {
      ".ts": "ts",
      ".tsx": "tsx",
      ".jsx": "jsx",
      ".js": "js",
    },
    ...buildEsbuildResolveOptions(options.config.resolve, root),
  });

  if (!silent) console.log(`  ${pc.green("\u2713")}  client`);

  // Server build
  const serverEntryPoints: Record<string, string> = {};
  const serverEntryRouteMap = new Map<
    string,
    { routeId: string; type: "page" | "api" }
  >();

  for (const route of pageRoutes) {
    const key = "page__" + routeIdToSafeName(route.id);
    serverEntryPoints[key] = route.filePath;
    serverEntryRouteMap.set(route.filePath, {
      routeId: route.id,
      type: "page",
    });
  }
  for (const route of apiRoutes) {
    const key = "api__" + routeIdToSafeName(route.id);
    serverEntryPoints[key] = route.filePath;
    serverEntryRouteMap.set(route.filePath, { routeId: route.id, type: "api" });
  }

  // Add middleware files to server build
  for (const mw of scanResult.middlewares) {
    const key = "mw__" + routeIdToSafeName(mw.dirId);
    serverEntryPoints[key] = mw.filePath;
  }

  // Add layout files to server build
  for (const layout of scanResult.layouts) {
    const key = "layout__" + routeIdToSafeName(layout.id);
    serverEntryPoints[key] = layout.filePath;
  }

  // Add error boundary files to server build
  for (const err of scanResult.errors) {
    const key = "error__" + routeIdToSafeName(err.dirId);
    serverEntryPoints[key] = err.filePath;
  }

  // Add 404 page to server build
  if (scanResult.notFoundPage) {
    serverEntryPoints["page__404"] = scanResult.notFoundPage;
  }

  // Build the externals list: React subpaths + Node builtins
  const serverExternals = [
    "react",
    "react-dom",
    "react-dom/server",
    "react-dom/client",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
    ...(options.config.build?.external || []),
  ];

  const serverResult = await esbuild.build({
    entryPoints: serverEntryPoints,
    bundle: true,
    minify: false,
    sourcemap: "inline",
    outdir: serverOutDir,
    format: "esm",
    platform: "node",
    target: "node18",
    splitting: false,
    metafile: true,
    jsx: "automatic",
    jsxImportSource: "react",
    plugins: [...adapter.esbuildPlugins()],
    external: serverExternals,
    absWorkingDir: root,
    logLevel: "silent",
    loader: {
      ".ts": "ts",
      ".tsx": "tsx",
      ".jsx": "jsx",
      ".js": "js",
    },
    ...buildEsbuildResolveOptions(options.config.resolve, root),
  });

  if (!silent) console.log(`  ${pc.green("\u2713")}  server`);

  // Detect exports (hasLoad, prerender, cache, render mode, API methods)
  const globalMode: RenderMode = options.config.renderMode ?? "ssr";
  const hasLoadMap = new Map<string, boolean>();
  const apiMethodsMap = new Map<string, string[]>();
  const prerenderMap = new Map<string, true | PrerenderConfig>();
  const cacheMap = new Map<string, CacheConfig>();
  const renderModeMap = new Map<string, RenderMode>();

  // Build a map from routeId → server output path for import()
  const serverOutputPathMap = new Map<string, string>();

  for (const [outputPath, outputMeta] of Object.entries(
    serverResult.metafile!.outputs,
  )) {
    if (!outputMeta.entryPoint) continue;

    const entryAbsolute = path.resolve(root, outputMeta.entryPoint);
    const routeInfo = serverEntryRouteMap.get(entryAbsolute);
    if (!routeInfo) continue;

    const exports = outputMeta.exports || [];

    if (routeInfo.type === "page") {
      hasLoadMap.set(routeInfo.routeId, exports.includes("load"));
      serverOutputPathMap.set(
        routeInfo.routeId,
        path.resolve(root, outputPath),
      );

      if (
        exports.includes("render") ||
        exports.includes("prerender") ||
        exports.includes("cache")
      ) {
        const modUrl = pathToFileURL(path.resolve(root, outputPath)).href;
        const mod = await import(modUrl);

        const mode = resolveRouteRenderMode(mod, globalMode);
        renderModeMap.set(routeInfo.routeId, mode);

        if (mode === "ssg") {
          if (
            mod.prerender === true ||
            (!mod.prerender && mod.render === "ssg")
          ) {
            prerenderMap.set(routeInfo.routeId, true);
          } else if (
            typeof mod.prerender === "object" &&
            typeof mod.prerender.paths === "function"
          ) {
            prerenderMap.set(routeInfo.routeId, mod.prerender);
          }
        }

        if (mod.cache && typeof mod.cache === "object") {
          cacheMap.set(routeInfo.routeId, mod.cache);
        }
      } else {
        renderModeMap.set(routeInfo.routeId, globalMode);
      }
    } else {
      const methods = exports.filter((e) =>
        (HTTP_METHODS as readonly string[]).includes(e),
      );
      if (methods.length > 0) {
        apiMethodsMap.set(routeInfo.routeId, methods);
      }
    }
  }

  // Build output maps
  const clientOutputMap = buildClientOutputMap(
    clientResult.metafile!,
    clientEntryMap,
    clientOutDir,
    root,
  );
  const serverOutputMap = buildServerOutputMap(
    serverResult.metafile!,
    serverEntryRouteMap,
    serverOutDir,
    root,
  );
  const serverMwLayoutOutputMap = buildServerMwLayoutOutputMap(
    serverResult.metafile!,
    scanResult,
    serverOutDir,
    root,
  );
  const clientLayoutOutputMap = buildClientLayoutOutputMap(
    clientResult.metafile!,
    clientLayoutMap,
    clientOutDir,
    root,
  );
  const clientErrorOutputMap = buildClientLayoutOutputMap(
    clientResult.metafile!,
    clientErrorMap,
    clientOutDir,
    root,
  );

  // Assemble manifest
  const manifest: RouteManifest = assembleManifest(
    adapter,
    base,
    globalMode,
    router,
    clientOutputMap,
    serverOutputMap,
    hasLoadMap,
    apiMethodsMap,
    prerenderMap,
    cacheMap,
    renderModeMap,
    clientResult.metafile!,
    clientOutDir,
    scanResult,
    serverMwLayoutOutputMap,
    clientLayoutOutputMap,
    clientErrorOutputMap,
  );

  // Generate SPA fallback if any SPA routes exist
  const hasSpaRoutes = [...renderModeMap.values()].some((m) => m === "spa");
  if (hasSpaRoutes) {
    const shell = adapter.getDocumentShell?.() || DEFAULT_SHELL;
    const clientDir = path.join(outDir, "client");
    const spaHtml = shell
      .replace("__CONTAINER_ID__", containerId)
      .replace("<!--pyra-outlet-->", "")
      .replace("<!--pyra-head-->", "");
    fs.writeFileSync(path.join(clientDir, "__spa.html"), spaHtml, "utf-8");
    manifest.spaFallback = "__spa.html";
  }

  // Prerender static routes (SSG)
  if (prerenderMap.size > 0) {
    const shell = adapter.getDocumentShell?.() || DEFAULT_SHELL;
    const clientDir = path.join(outDir, "client");

    for (const [routeId, prerenderConfig] of prerenderMap) {
      const entry = manifest.routes[routeId];
      if (!entry || entry.type !== "page") continue;

      const serverModPath = serverOutputPathMap.get(routeId);
      if (!serverModPath) continue;

      const mod = await import(pathToFileURL(serverModPath).href);
      const component = mod.default;
      if (!component) {
        log.warn(
          `Route "${routeId}" has no default export — skipping prerender.`,
        );
        continue;
      }

      let paramSets: Record<string, string>[];
      if (prerenderConfig === true) {
        paramSets = [{}];
      } else {
        paramSets = await prerenderConfig.paths();
      }

      let renderedCount = 0;
      for (const params of paramSets) {
        let pathname = entry.pattern;
        for (const [key, value] of Object.entries(params)) {
          pathname = pathname.replace(`:${key}`, value);
        }

        let data: unknown = null;
        if (entry.hasLoad && typeof mod.load === "function") {
          const ctx = createBuildTimeRequestContext({
            pathname,
            params,
            routeId,
            envPrefix: options.config.env?.prefix,
          });
          try {
            const loadResult = await mod.load(ctx);
            if (loadResult instanceof Response) continue;
            data = loadResult;
          } catch (loadError) {
            log.warn(
              `Prerender load() failed for ${pathname}: ${loadError instanceof Error ? loadError.message : String(loadError)}`,
            );
            log.warn(
              `  Skipping prerender for ${pathname} — will fall back to SSR.`,
            );
            continue;
          }
        }

        // Load layout components for this route
        const layoutComponents: unknown[] = [];
        if (entry.layoutEntries && entry.layoutEntries.length > 0) {
          for (const layoutServerPath of entry.layoutEntries) {
            const layoutAbsPath = path.join(serverOutDir, layoutServerPath);
            const layoutMod = await import(pathToFileURL(layoutAbsPath).href);
            if (layoutMod.default) layoutComponents.push(layoutMod.default);
          }
        }

        // Render via adapter
        const headTags: string[] = [];
        const renderContext = {
          url: new URL(pathname, "http://localhost"),
          params,
          pushHead(tag: string) {
            headTags.push(tag);
          },
          layouts:
            layoutComponents.length > 0 ? layoutComponents : undefined,
        };

        let bodyHtml: string;
        try {
          bodyHtml = await adapter.renderToHTML(
            component,
            data,
            renderContext,
          );
        } catch (renderError) {
          log.warn(
            `Prerender render failed for ${pathname}: ${renderError instanceof Error ? renderError.message : String(renderError)}`,
          );
          log.warn(
            `  Skipping prerender for ${pathname} — will fall back to SSR.`,
          );
          continue;
        }

        // Build asset tags from manifest
        const assetTags = buildPrerenderAssetTags(entry, base);

        // Build hydration data
        const hydrationData: Record<string, unknown> = {};
        if (data && typeof data === "object") {
          Object.assign(hydrationData, data);
        }
        hydrationData.params = params;
        const serializedData = escapeJsonForScript(
          JSON.stringify(hydrationData),
        );
        const dataScript = `<script id="__pyra_data" type="application/json">${serializedData}</script>`;

        // Build hydration script (with layout client paths if present)
        const clientEntryUrl = base + entry.clientEntry;
        const layoutClientUrls = entry.layoutClientEntries
          ? entry.layoutClientEntries.map((p) => base + p)
          : undefined;
        const hydrationScript = adapter.getHydrationScript(
          clientEntryUrl,
          containerId,
          layoutClientUrls,
        );

        // Assemble full HTML
        let html = shell;
        html = html.replace("__CONTAINER_ID__", containerId);
        html = html.replace("<!--pyra-outlet-->", bodyHtml);
        html = html.replace(
          "<!--pyra-head-->",
          headTags.join("\n  ") +
            (headTags.length && assetTags.head ? "\n  " : "") +
            assetTags.head,
        );
        html = html.replace(
          "</body>",
          `  ${dataScript}\n  <script type="module">${hydrationScript}</script>\n</body>`,
        );

        // Write to dist/client/[path]/index.html
        const htmlRelPath =
          pathname === "/" ? "index.html" : pathname.slice(1) + "/index.html";
        const htmlAbsPath = path.join(clientDir, htmlRelPath);
        fs.mkdirSync(path.dirname(htmlAbsPath), { recursive: true });
        fs.writeFileSync(htmlAbsPath, html, "utf-8");

        renderedCount++;

        if (paramSets.length === 1) {
          entry.prerenderedFile = htmlRelPath;
        }
      }

      entry.prerendered = true;
      if (paramSets.length > 1) {
        entry.prerenderedCount = renderedCount;
      }

      if (!silent) {
        const pagesStr =
          renderedCount === 1 ? "1 page" : `${renderedCount} pages`;
        console.log(
          `  ${pc.green("\u2713")}  ${routeId}  ${pc.dim(`prerendered (${pagesStr})`)}`,
        );
      }
    }
  }

  // Copy public/ directory to dist/client/
  const publicDirName = resolvedConfig.build?.publicDir ?? "public";
  const publicDirPath = path.resolve(root, publicDirName);
  if (fs.existsSync(publicDirPath)) {
    fs.cpSync(publicDirPath, path.join(outDir, "client"), { recursive: true });
  }

  // Plugin: buildEnd() hooks — mutate manifest before writing
  for (const plugin of plugins) {
    await plugin.buildEnd?.({ manifest, outDir, root });
  }

  // Write manifest (after prerender updates and plugin mutations)
  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  // Cleanup temp directory
  const pyraBuildDir = path.join(root, ".pyra", "build");
  if (fs.existsSync(pyraBuildDir)) {
    fs.rmSync(pyraBuildDir, { recursive: true, force: true });
  }

  // Print build report
  const totalDurationMs = performance.now() - startTime;
  const clientOutputCount = Object.keys(clientResult.metafile!.outputs).length;
  const serverOutputCount = Object.keys(serverResult.metafile!.outputs).length;

  if (!silent) {
    printBuildReport(
      manifest,
      totalDurationMs,
      clientOutDir,
      serverOutDir,
      options.config,
    );
  }

  return {
    manifest,
    clientOutputCount,
    serverOutputCount,
    totalDurationMs,
  };
}

// Re-export adapter type so callers don't need a separate import
export type { PyraAdapter };
