import * as esbuild from "esbuild";
import { builtinModules } from "node:module";
import { gzipSync } from "node:zlib";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  log,
  type PyraConfig,
  type PyraAdapter,
  type RouteManifest,
  type ManifestRouteEntry,
  type ManifestAsset,
  type RouteGraph,
  type RenderContext,
  type RenderMode,
  type CacheConfig,
  type PrerenderConfig,
  HTTP_METHODS,
  getOutDir,
} from "pyrajs-shared";
import { resolveRouteRenderMode } from "./render-mode.js";
import { createPostCSSPlugin } from "./css-plugin.js";
import pc from "picocolors";
import {
  scanRoutes,
  type ScanResult,
  type ScannedLayout,
  type ScannedMiddleware,
  type ScannedError,
} from "./scanner.js";
import { createRouter } from "./router.js";
import {
  createBuildTimeRequestContext,
  escapeJsonForScript,
} from "./request-context.js";
import { type BuildOrchestratorOptions, type BuildResult } from "./types.js";
import { buildSPA } from "./buildSPA.js";
import { buildEsbuildResolveOptions } from "./bundler.js";

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

  // SPA build: fall back when there is no routes directory on disk. We check the filesystem rather than config.entry because the config loader
  if (!fs.existsSync(routesDir)) {
    return buildSPA(options);
  }

  // Plugin: config() hooks
  const plugins = options.config.plugins ?? [];
  let resolvedConfig = options.config;
  for (const plugin of plugins) {
    resolvedConfig = (await plugin.config?.(resolvedConfig, "production")) ?? resolvedConfig;
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
    // This keeps React-specific code out of core.
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
    splitting: true,
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

  //  Add 404 page to server build
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

    // esbuild metafile uses posix paths relative to absWorkingDir
    const entryAbsolute = path.resolve(root, outputMeta.entryPoint);
    const routeInfo = serverEntryRouteMap.get(entryAbsolute);
    if (!routeInfo) continue;

    const exports = outputMeta.exports || [];

    if (routeInfo.type === "page") {
      hasLoadMap.set(routeInfo.routeId, exports.includes("load"));
      // Track server output path for later import
      serverOutputPathMap.set(
        routeInfo.routeId,
        path.resolve(root, outputPath),
      );

      // Import module if it exports render, prerender, or cache
      if (
        exports.includes("render") ||
        exports.includes("prerender") ||
        exports.includes("cache")
      ) {
        const modUrl = pathToFileURL(path.resolve(root, outputPath)).href;
        const mod = await import(modUrl);

        // Resolve render mode (render export > prerender > global default)
        const mode = resolveRouteRenderMode(mod, globalMode);
        renderModeMap.set(routeInfo.routeId, mode);

        // Only populate prerenderMap for SSG routes
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
        // No render/prerender/cache exports — use global default
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

  // ── 8. Generate manifest ───────────────────────────────────────────────

  // Build client output map: routeId → { entry, chunks, css }
  const clientOutputMap = buildClientOutputMap(
    clientResult.metafile!,
    clientEntryMap,
    clientOutDir,
    root,
  );

  // Build server output map: routeId → relative server entry path
  const serverOutputMap = buildServerOutputMap(
    serverResult.metafile!,
    serverEntryRouteMap,
    serverOutDir,
    root,
  );

  // Build server output map for middleware and layouts
  const serverMwLayoutOutputMap = buildServerMwLayoutOutputMap(
    serverResult.metafile!,
    scanResult,
    serverOutDir,
    root,
  );

  // Build client output map for layouts
  const clientLayoutOutputMap = buildClientLayoutOutputMap(
    clientResult.metafile!,
    clientLayoutMap,
    clientOutDir,
    root,
  );

  //  Build client output map for error boundaries
  const clientErrorOutputMap = buildClientLayoutOutputMap(
    clientResult.metafile!,
    clientErrorMap,
    clientOutDir,
    root,
  );

  // Assemble manifest
  const manifest = assembleManifest(
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

  // ── 8.5. Generate SPA fallback if any SPA routes exist ────────────────
  const hasSpaRoutes = [...renderModeMap.values()].some((m) => m === "spa");
  if (hasSpaRoutes) {
    const shell = adapter.getDocumentShell?.() || DEFAULT_SHELL;
    const clientDir = path.join(outDir, "client");
    let spaHtml = shell
      .replace("__CONTAINER_ID__", containerId)
      .replace("<!--pyra-outlet-->", "")
      .replace("<!--pyra-head-->", "");
    fs.writeFileSync(path.join(clientDir, "__spa.html"), spaHtml, "utf-8");
    manifest.spaFallback = "__spa.html";
  }

  // ── 9. Prerender static routes (SSG) ─────────────────────────────────
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

      // Determine parameter sets to prerender
      let paramSets: Record<string, string>[];
      if (prerenderConfig === true) {
        // Static route: single render with no params
        paramSets = [{}];
      } else {
        // Dynamic route: call paths() to get param sets
        paramSets = await prerenderConfig.paths();
      }

      let renderedCount = 0;
      for (const params of paramSets) {
        // Build the concrete pathname from the route pattern + params
        let pathname = entry.pattern;
        for (const [key, value] of Object.entries(params)) {
          pathname = pathname.replace(`:${key}`, value);
        }

        // Call load() if present ( wrapped in try-catch)
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
            // If load() returns a Response, skip this page (e.g., redirect)
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
        const renderContext: RenderContext = {
          url: new URL(pathname, "http://localhost"),
          params,
          pushHead(tag: string) {
            headTags.push(tag);
          },
          layouts: layoutComponents.length > 0 ? layoutComponents : undefined,
        };

        let bodyHtml: string;
        try {
          bodyHtml = await adapter.renderToHTML(component, data, renderContext);
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

        // Track the first prerendered file path in the manifest
        // (for static routes: the single file; for dynamic: the pattern-level file path)
        if (paramSets.length === 1) {
          entry.prerenderedFile = htmlRelPath;
        }
      }

      // Update manifest entry
      entry.prerendered = true;
      if (paramSets.length > 1) {
        entry.prerenderedCount = renderedCount;
      }

      if (!silent) {
        const pagesStr = renderedCount === 1 ? "1 page" : `${renderedCount} pages`;
        console.log(`  ${pc.green("\u2713")}  ${routeId}  ${pc.dim(`prerendered (${pagesStr})`)}`);
      }
    }
  }

  // ── Copy public/ directory to dist/client/ ────────────────────────────────
  const publicDirName = resolvedConfig.build?.publicDir ?? "public";
  const publicDirPath = path.resolve(root, publicDirName);
  if (fs.existsSync(publicDirPath)) {
    fs.cpSync(publicDirPath, path.join(outDir, "client"), { recursive: true });
  }

  // ── Plugin: buildEnd() hooks — mutate manifest before writing ────────────
  for (const plugin of plugins) {
    await plugin.buildEnd?.({ manifest, outDir, root });
  }

  // Write manifest (after prerender updates and plugin mutations)
  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  // ── 10. Cleanup temp directory ─────────────────────────────────────────
  const pyraBuilDir = path.join(root, ".pyra", "build");
  if (fs.existsSync(pyraBuilDir)) {
    fs.rmSync(pyraBuilDir, { recursive: true, force: true });
  }

  // ── 11. Print build report ─────────────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a route ID to a safe filename.
 * '/' → '_index', '/blog/[slug]' → 'blog__slug_'
 */
function routeIdToSafeName(routeId: string): string {
  if (routeId === "/") return "_index";
  return routeId
    .slice(1) // Remove leading /
    .replace(/\[/g, "") // Remove [
    .replace(/\]/g, "_") // Replace ] with _
    .replace(/\.\.\./g, "_rest") // [...rest] → _rest
    .replace(/\//g, "__"); // / → __
}

/**
 * Get all ancestor directory IDs from root to the given route ID.
 * '/blog/[slug]' → ['/', '/blog', '/blog/[slug]']
 */
function getAncestorDirIds(routeId: string): string[] {
  if (routeId === "/") return ["/"];
  const segments = routeId.split("/").filter(Boolean);
  const ancestors: string[] = ["/"];
  let current = "";
  for (const seg of segments) {
    current += "/" + seg;
    ancestors.push(current);
  }
  return ancestors;
}

/**
 * Build client output map by correlating esbuild metafile back to routes.
 */
function buildClientOutputMap(
  meta: esbuild.Metafile,
  clientEntryMap: Map<string, string>,
  clientOutDir: string,
  root: string,
): Map<string, { entry: string; chunks: string[]; css: string[] }> {
  // Invert entry map: normalized entry file path → routeId
  const pathToRouteId = new Map<string, string>();
  for (const [routeId, entryPath] of clientEntryMap) {
    const normalized = path.relative(root, entryPath).split(path.sep).join("/");
    pathToRouteId.set(normalized, routeId);
  }

  const result = new Map<
    string,
    { entry: string; chunks: string[]; css: string[] }
  >();

  for (const [outputPath, outputMeta] of Object.entries(meta.outputs)) {
    if (!outputMeta.entryPoint) continue;

    const routeId = pathToRouteId.get(outputMeta.entryPoint);
    if (!routeId) continue;

    // Path relative to dist/client/ (parent of assets/)
    const clientDir = path.dirname(clientOutDir);
    const relativeEntry = path
      .relative(clientDir, path.resolve(root, outputPath))
      .split(path.sep)
      .join("/");

    // Collect CSS
    const css: string[] = [];
    if (outputMeta.cssBundle) {
      const cssRel = path
        .relative(clientDir, path.resolve(root, outputMeta.cssBundle))
        .split(path.sep)
        .join("/");
      css.push(cssRel);
    }

    // Collect shared chunk imports
    const chunks: string[] = [];
    for (const imp of outputMeta.imports || []) {
      if (imp.kind === "import-statement" && !imp.external) {
        const chunkRel = path
          .relative(clientDir, path.resolve(root, imp.path))
          .split(path.sep)
          .join("/");
        // Don't include the entry itself as a chunk
        if (chunkRel !== relativeEntry) {
          chunks.push(chunkRel);
        }
      }
    }

    result.set(routeId, { entry: relativeEntry, chunks, css });
  }

  return result;
}

/**
 * Build server output map: routeId → relative path to server entry.
 */
function buildServerOutputMap(
  meta: esbuild.Metafile,
  entryRouteMap: Map<string, { routeId: string; type: "page" | "api" }>,
  serverOutDir: string,
  root: string,
): Map<string, string> {
  const result = new Map<string, string>();

  for (const [outputPath, outputMeta] of Object.entries(meta.outputs)) {
    if (!outputMeta.entryPoint) continue;

    const entryAbsolute = path.resolve(root, outputMeta.entryPoint);
    const routeInfo = entryRouteMap.get(entryAbsolute);
    if (!routeInfo) continue;

    const relativePath = path
      .relative(serverOutDir, path.resolve(root, outputPath))
      .split(path.sep)
      .join("/");
    result.set(routeInfo.routeId, relativePath);
  }

  return result;
}

/**
 * Build server output map for middleware, layout, and error boundary files.
 * Returns filePath → relative server output path.
 */
function buildServerMwLayoutOutputMap(
  meta: esbuild.Metafile,
  scanResult: ScanResult,
  serverOutDir: string,
  root: string,
): Map<string, string> {
  // Collect all middleware + layout + error boundary source file paths
  const knownPaths = new Set<string>();
  for (const mw of scanResult.middlewares) knownPaths.add(mw.filePath);
  for (const layout of scanResult.layouts) knownPaths.add(layout.filePath);
  for (const err of scanResult.errors) knownPaths.add(err.filePath);
  if (scanResult.notFoundPage) knownPaths.add(scanResult.notFoundPage);

  const result = new Map<string, string>();

  for (const [outputPath, outputMeta] of Object.entries(meta.outputs)) {
    if (!outputMeta.entryPoint) continue;
    const entryAbsolute = path.resolve(root, outputMeta.entryPoint);
    if (!knownPaths.has(entryAbsolute)) continue;

    const relativePath = path
      .relative(serverOutDir, path.resolve(root, outputPath))
      .split(path.sep)
      .join("/");
    result.set(entryAbsolute, relativePath);
  }

  return result;
}

/**
 * Build client output map for layout files.
 * Returns layoutId → relative client output path.
 */
function buildClientLayoutOutputMap(
  meta: esbuild.Metafile,
  clientLayoutMap: Map<string, string>,
  clientOutDir: string,
  root: string,
): Map<string, string> {
  // Invert: normalize file path → layoutId
  const pathToLayoutId = new Map<string, string>();
  for (const [layoutId, filePath] of clientLayoutMap) {
    const normalized = path.relative(root, filePath).split(path.sep).join("/");
    pathToLayoutId.set(normalized, layoutId);
  }

  const result = new Map<string, string>();
  const clientDir = path.dirname(clientOutDir); // dist/client/

  for (const [outputPath, outputMeta] of Object.entries(meta.outputs)) {
    if (!outputMeta.entryPoint) continue;
    const layoutId = pathToLayoutId.get(outputMeta.entryPoint);
    if (!layoutId) continue;

    const relativePath = path
      .relative(clientDir, path.resolve(root, outputPath))
      .split(path.sep)
      .join("/");
    result.set(layoutId, relativePath);
  }

  return result;
}

// Assemble the final RouteManifest from all collected data.
function assembleManifest(
  adapter: PyraAdapter,
  base: string,
  globalMode: RenderMode,
  router: RouteGraph,
  clientOutputMap: Map<
    string,
    { entry: string; chunks: string[]; css: string[] }
  >,
  serverOutputMap: Map<string, string>,
  hasLoadMap: Map<string, boolean>,
  apiMethodsMap: Map<string, string[]>,
  prerenderMap: Map<string, true | PrerenderConfig>,
  cacheMap: Map<string, CacheConfig>,
  renderModeMap: Map<string, RenderMode>,
  clientMeta: esbuild.Metafile,
  clientOutDir: string,
  scanResult: ScanResult,
  serverMwLayoutOutputMap: Map<string, string>,
  clientLayoutOutputMap: Map<string, string>,
  clientErrorOutputMap: Map<string, string>,
): RouteManifest {
  const routes: Record<string, ManifestRouteEntry> = {};

  // Build lookup: middleware dirId → server output relative path
  const mwServerPaths = new Map<string, string>();
  for (const mw of scanResult.middlewares) {
    const serverPath = serverMwLayoutOutputMap.get(mw.filePath);
    if (serverPath) mwServerPaths.set(mw.dirId, serverPath);
  }

  // Build lookup: layout id → server output relative path
  const layoutServerPaths = new Map<string, string>();
  for (const layout of scanResult.layouts) {
    const serverPath = serverMwLayoutOutputMap.get(layout.filePath);
    if (serverPath) layoutServerPaths.set(layout.id, serverPath);
  }

  // Build lookup: error boundary dirId → server output relative path
  const errorServerPaths = new Map<string, string>();
  for (const err of scanResult.errors) {
    const serverPath = serverMwLayoutOutputMap.get(err.filePath);
    if (serverPath) errorServerPaths.set(err.dirId, serverPath);
  }

  // Helper: resolve layout chain for a route (outermost first)
  function resolveLayoutChain(routeId: string): string[] {
    const ancestors = getAncestorDirIds(routeId);
    const chain: string[] = [];
    for (const dirId of ancestors) {
      if (layoutServerPaths.has(dirId)) chain.push(dirId);
    }
    return chain;
  }

  // Helper: resolve middleware chain for a route
  function resolveMiddlewareBundledPaths(middlewarePaths: string[]): string[] {
    const result: string[] = [];
    for (const mw of scanResult.middlewares) {
      if (middlewarePaths.includes(mw.filePath)) {
        const serverPath = mwServerPaths.get(mw.dirId);
        if (serverPath) result.push(serverPath);
      }
    }
    return result;
  }

  // Page routes
  for (const route of router.pageRoutes()) {
    const clientOutput = clientOutputMap.get(route.id);
    const serverEntry = serverOutputMap.get(route.id);

    const routeCache = cacheMap.get(route.id);
    const layoutChain = resolveLayoutChain(route.id);
    const layoutEntries = layoutChain
      .map((id) => layoutServerPaths.get(id)!)
      .filter(Boolean);
    const layoutClientEntries = layoutChain
      .map((id) => clientLayoutOutputMap.get(id)!)
      .filter(Boolean);
    const mwBundled = resolveMiddlewareBundledPaths(route.middlewarePaths);

    // Resolve error boundary for this route
    const errorBoundaryEntry = route.errorBoundaryId
      ? errorServerPaths.get(route.errorBoundaryId)
      : undefined;
    const errorBoundaryClientEntry = route.errorBoundaryId
      ? clientErrorOutputMap.get(route.errorBoundaryId)
      : undefined;

    const routeMode = renderModeMap.get(route.id) ?? globalMode;

    routes[route.id] = {
      id: route.id,
      pattern: route.pattern,
      type: "page",
      renderMode: routeMode,
      clientEntry: clientOutput?.entry,
      clientChunks: clientOutput?.chunks?.length
        ? clientOutput.chunks
        : undefined,
      css: clientOutput?.css?.length ? clientOutput.css : undefined,
      ssrEntry: routeMode !== "spa" ? serverEntry : undefined,
      hasLoad: hasLoadMap.get(route.id) || false,
      cache: routeCache,
      layouts: layoutChain.length ? layoutChain : undefined,
      layoutEntries: layoutEntries.length ? layoutEntries : undefined,
      layoutClientEntries: layoutClientEntries.length
        ? layoutClientEntries
        : undefined,
      middleware: mwBundled.length ? mwBundled : undefined,
      errorBoundaryEntry,
      errorBoundaryClientEntry,
    };
  }

  // API routes
  for (const route of router.apiRoutes()) {
    const serverEntry = serverOutputMap.get(route.id);
    const mwBundled = resolveMiddlewareBundledPaths(route.middlewarePaths);

    // Resolve error boundary for API routes too
    const errorBoundaryEntry = route.errorBoundaryId
      ? errorServerPaths.get(route.errorBoundaryId)
      : undefined;
    const errorBoundaryClientEntry = route.errorBoundaryId
      ? clientErrorOutputMap.get(route.errorBoundaryId)
      : undefined;

    routes[route.id] = {
      id: route.id,
      pattern: route.pattern,
      type: "api",
      serverEntry,
      methods: apiMethodsMap.get(route.id),
      middleware: mwBundled.length ? mwBundled : undefined,
      errorBoundaryEntry,
      errorBoundaryClientEntry,
    };
  }

  // Add 404 page to manifest if present
  if (scanResult.notFoundPage) {
    const notFoundServerPath = serverMwLayoutOutputMap.get(
      scanResult.notFoundPage,
    );
    routes["__404"] = {
      id: "__404",
      pattern: "/__404",
      type: "page",
      ssrEntry: notFoundServerPath,
      hasLoad: false,
    };
  }

  // Asset inventory from client metafile
  const assets: Record<string, ManifestAsset> = {};
  const clientDir = path.dirname(clientOutDir); // dist/client/

  for (const [outputPath, outputMeta] of Object.entries(clientMeta.outputs)) {
    const absOutput = path.resolve(process.cwd(), outputPath);
    const relativePath = path
      .relative(clientDir, absOutput)
      .split(path.sep)
      .join("/");
    const ext = path.extname(outputPath);

    // Extract hash from content-hashed filename (name-HASH.ext)
    const basename = path.basename(outputPath, ext);
    const hashMatch = basename.match(/-([A-Za-z0-9]+)$/);
    const hash = hashMatch ? hashMatch[1] : "";

    assets[relativePath] = {
      file: relativePath,
      hash,
      size: outputMeta.bytes,
      type: getMimeType(ext),
    };
  }

  return {
    version: 1,
    adapter: adapter.name,
    base,
    builtAt: new Date().toISOString(),
    renderMode: globalMode,
    routes,
    assets,
  };
}

// Build an empty manifest when no routes are found.
function buildEmptyManifest(
  adapterName: string,
  base: string,
  renderMode: RenderMode = "ssr",
): RouteManifest {
  return {
    version: 1,
    adapter: adapterName,
    base,
    builtAt: new Date().toISOString(),
    renderMode,
    routes: {},
    assets: {},
  };
}

function printBuildReport(
  manifest: RouteManifest,
  totalDurationMs: number,
  clientOutDir: string,
  serverOutDir: string,
  config?: PyraConfig,
): void {
  const warnSize = config?.buildReport?.warnSize ?? 51200; // 50 KB default

  // Exclude the internal __404 sentinel; sort pages before APIs, then alphabetically.
  const sortedRoutes = Object.values(manifest.routes)
    .filter((r) => r.id !== "__404")
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "page" ? -1 : 1;
      return a.pattern.localeCompare(b.pattern);
    });

  let pageCount = 0;
  let apiCount = 0;
  let ssgCount = 0;
  let prerenderTotal = 0;
  let totalJS = 0;
  let totalCSS = 0;

  // Column geometry
  const ROUTE_W = 32;
  const MODE_W = 8;
  const JS_W = 10;
  const SEP = "\u2500".repeat(70);

  // ── Header ───────────────────────────────────────────────────────────────
  console.log("");
  console.log(
    `  ${pc.bold("Route".padEnd(ROUTE_W))}${pc.bold("Mode".padEnd(MODE_W + 2))}${pc.bold("Client JS".padStart(JS_W))}   ${pc.bold("CSS")}`,
  );
  console.log("  " + pc.dim(SEP));

  // ── Rows ─────────────────────────────────────────────────────────────────
  for (const entry of sortedRoutes) {
    // Truncate long paths so the table stays narrow
    const truncated =
      entry.pattern.length > ROUTE_W - 1
        ? entry.pattern.slice(0, ROUTE_W - 2) + "\u2026"
        : entry.pattern;
    const routeCol = truncated.padEnd(ROUTE_W);

    if (entry.type === "page") {
      pageCount++;
      const routeMode = entry.renderMode ?? "ssr";

      // Mode label — colored by rendering strategy
      let modeLabel: string;
      if (routeMode === "ssg") {
        ssgCount++;
        const countSuffix =
          entry.prerenderedCount && entry.prerenderedCount > 1
            ? `(${entry.prerenderedCount})`
            : "";
        prerenderTotal += entry.prerenderedCount ?? 1;
        modeLabel = pc.green(("SSG" + countSuffix).padEnd(MODE_W));
      } else if (routeMode === "spa") {
        modeLabel = pc.yellow("SPA".padEnd(MODE_W));
      } else {
        modeLabel = pc.blue("SSR".padEnd(MODE_W));
      }

      // JS size — sum of client entry + shared chunks
      let jsSize = 0;
      if (entry.clientEntry) {
        const asset = manifest.assets[entry.clientEntry];
        if (asset) jsSize += asset.size;
      }
      for (const chunk of entry.clientChunks ?? []) {
        const asset = manifest.assets[chunk];
        if (asset) jsSize += asset.size;
      }
      totalJS += jsSize;

      // CSS size
      let cssSize = 0;
      for (const css of entry.css ?? []) {
        const asset = manifest.assets[css];
        if (asset) cssSize += asset.size;
      }
      totalCSS += cssSize;

      // Warning flag placed AFTER the number so column alignment is preserved
      const jsRaw = formatSize(jsSize).padStart(JS_W);
      const warn = jsSize > warnSize;
      const jsFull = warn
        ? pc.yellow(jsRaw) + "  " + pc.yellow("\u26a0")
        : jsRaw + "   ";

      const cssFull =
        cssSize > 0
          ? formatSize(cssSize).padStart(8)
          : pc.dim("\u2014".padStart(8));

      console.log(`  ${pc.cyan(routeCol)}${modeLabel}  ${jsFull}  ${cssFull}`);
    } else {
      apiCount++;

      // Show HTTP methods in the Mode column for API routes
      const methods = entry.methods?.join(" ") ?? "\u2014";
      const modeLabel = pc.dim(methods.padEnd(MODE_W));
      const dash = pc.dim("\u2014");

      console.log(
        `  ${pc.dim(routeCol)}${modeLabel}  ${"\u2014".padStart(JS_W)}     ${dash}`,
      );
    }
  }

  console.log("  " + pc.dim(SEP));

  // ── Totals ────────────────────────────────────────────────────────────────
  const pagePart = `${pageCount} page${pageCount !== 1 ? "s" : ""}`;
  const apiPart = apiCount > 0 ? ` · ${apiCount} API` : "";
  const ssgPart = ssgCount > 0 ? ` · ${ssgCount} SSG` : "";
  const countLabel = pc.dim((pagePart + apiPart + ssgPart).padEnd(ROUTE_W + MODE_W));

  const clientDir = path.dirname(clientOutDir);
  const gzipSize = estimateGzipSize(clientDir);
  const gzipPart =
    gzipSize > 0 ? pc.dim(`   gzip ~${formatSize(gzipSize)}`) : "";

  console.log(
    `  ${countLabel}  ${formatSize(totalJS).padStart(JS_W)}${gzipPart}`,
  );
  console.log("");

  // ── Shared chunks ─────────────────────────────────────────────────────────
  const sharedChunks = getSharedChunks(manifest);
  if (sharedChunks.length > 0) {
    console.log(`  ${pc.bold("Shared chunks")}`);
    for (const chunk of sharedChunks) {
      const sizeStr = formatSize(chunk.size).padStart(10);
      const usage = pc.dim(
        `shared by ${chunk.usedBy} page${chunk.usedBy !== 1 ? "s" : ""}`,
      );
      console.log(`  ${pc.dim(chunk.name.padEnd(32))} ${sizeStr}  ${usage}`);
    }
    console.log("");
  }

  // ── Output dirs ───────────────────────────────────────────────────────────
  const clientFiles = countFilesRecursive(clientDir);
  const serverFiles = countFilesRecursive(serverOutDir);
  console.log(
    `  ${pc.dim("dist/client/")}   ${clientFiles} files    ${pc.dim("dist/server/")}   ${serverFiles} files`,
  );
  console.log("");

  // ── Final timing line ─────────────────────────────────────────────────────
  const ms = Math.round(totalDurationMs);
  const durationStr = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
  console.log(`  ${pc.green("\u279c")}  built in ${pc.bold(durationStr)}`);
  console.log("");
}

// Estimate gzip size of all JS/CSS files in the client output.
function estimateGzipSize(clientDir: string): number {
  if (!fs.existsSync(clientDir)) return 0;

  let totalGzipped = 0;
  const assetsDir = path.join(clientDir, "assets");
  if (!fs.existsSync(assetsDir)) return 0;

  try {
    const files = fs.readdirSync(assetsDir);
    for (const file of files) {
      if (file.endsWith(".js") || file.endsWith(".css")) {
        const content = fs.readFileSync(path.join(assetsDir, file));
        const gzipped = gzipSync(content, { level: 6 });
        totalGzipped += gzipped.length;
      }
    }
  } catch {
    // Ignore errors — gzip estimate is optional
  }

  return totalGzipped;
}

// Identify shared chunks and how many page routes use each.
function getSharedChunks(
  manifest: RouteManifest,
): { name: string; size: number; usedBy: number }[] {
  const chunkUsage = new Map<string, number>();

  for (const entry of Object.values(manifest.routes)) {
    if (entry.type !== "page") continue;
    for (const chunk of entry.clientChunks || []) {
      chunkUsage.set(chunk, (chunkUsage.get(chunk) || 0) + 1);
    }
  }

  const result: { name: string; size: number; usedBy: number }[] = [];
  for (const [chunk, usedBy] of chunkUsage) {
    const asset = manifest.assets[chunk];
    const size = asset?.size || 0;
    const name = path.basename(chunk);
    result.push({ name, size, usedBy });
  }

  return result.sort((a, b) => b.size - a.size);
}

// Format a byte count as a human-readable size string.
function formatSize(bytes: number): string {
  if (bytes === 0) return "-";
  const kb = bytes / 1024;
  if (kb < 1) return `${bytes} B`;
  return `${kb.toFixed(1)} KB`;
}

// Count all files in a directory recursively.
function countFilesRecursive(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFilesRecursive(fullPath);
    } else {
      count++;
    }
  }
  return count;
}

// Default document shell when the adapter doesn't provide one
const DEFAULT_SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--pyra-head-->
</head>
<body>
  <div id="__CONTAINER_ID__"><!--pyra-outlet--></div>
</body>
</html>`;

// Generate <link> and <script> tags for a prerendered page's manifest-declared assets.
function buildPrerenderAssetTags(
  entry: ManifestRouteEntry,
  base: string,
): { head: string; body: string } {
  const headParts: string[] = [];

  for (const css of entry.css || []) {
    headParts.push(`<link rel="stylesheet" href="${base}${css}">`);
  }
  for (const chunk of entry.clientChunks || []) {
    headParts.push(`<link rel="modulepreload" href="${base}${chunk}">`);
  }
  if (entry.clientEntry) {
    headParts.push(
      `<link rel="modulepreload" href="${base}${entry.clientEntry}">`,
    );
  }

  return { head: headParts.join("\n  "), body: "" };
}

// Get MIME type from file extension.
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
    ".map": "application/json",
  };
  return mimeTypes[ext] || "application/octet-stream";
}
