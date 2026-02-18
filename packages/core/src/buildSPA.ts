import path from "node:path";


async function buildSPA(options: BuildOrchestratorOptions): Promise<BuildResult> {
  const startTime = performance.now();

  const root = options.root || options.config.root || process.cwd();
  const outDir = path.resolve(root, options.outDir || getOutDir(options.config) || 'dist');
  const entry = path.resolve(root, options.config.entry as string);
  const base = options.config.build?.base || '/';
  const minify = options.minify ?? options.config.build?.minify ?? true;
  const sourcemap = options.sourcemap ?? options.config.build?.sourcemap ?? false;
  const silent = options.silent ?? false;
  const adapter = options.adapter;

  log.info('Building SPA for production...');

  // Clean output and create dist/assets/
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  const assetsDir = path.join(outDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  // Bundle the entry
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    minify,
    sourcemap,
    outdir: assetsDir,
    format: 'esm',
    platform: 'browser',
    target: options.config.build?.target || 'es2020',
    splitting: true,
    metafile: true,
    entryNames: '[name]-[hash]',
    chunkNames: 'chunk-[hash]',
    assetNames: '[name]-[hash]',
    jsx: 'automatic',
    jsxImportSource: 'react',
    plugins: [createPostCSSPlugin(root), ...adapter.esbuildPlugins()],
    absWorkingDir: root,
    logLevel: 'silent',
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
      '.jsx': 'jsx',
      '.js': 'js',
    },
  });

  // Find the main JS output and its CSS bundle from the metafile
  const entryRelative = path.relative(root, entry).split(path.sep).join('/');
  let mainScript: string | null = null;
  let mainCss: string | null = null;

  for (const [outputPath, meta] of Object.entries(result.metafile!.outputs)) {
    if (meta.entryPoint !== entryRelative) continue;
    mainScript = path.relative(outDir, path.resolve(root, outputPath)).split(path.sep).join('/');
    if (meta.cssBundle) {
      mainCss = path.relative(outDir, path.resolve(root, meta.cssBundle)).split(path.sep).join('/');
    }
    break;
  }

  // Read and transform index.html
  const htmlSrc = path.join(root, 'index.html');
  let html: string;
  if (fs.existsSync(htmlSrc)) {
    html = fs.readFileSync(htmlSrc, 'utf-8');
  } else {
    const containerId = options.config.appContainerId || 'app';
    html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App</title>
</head>
<body>
  <div id="${containerId}"></div>
</body>
</html>`;
  }

  // Remove dev-time <script type="module" src="..."> tags (source file references)
  html = html.replace(
    /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'][^"']*["'][^>]*>(\s*)<\/script>[ \t]*\n?/gi,
    '',
  );
  // Also handle reversed attribute order: src="..." type="module"
  html = html.replace(
    /<script\b[^>]*\bsrc=["'][^"']*["'][^>]*\btype=["']module["'][^>]*>(\s*)<\/script>[ \t]*\n?/gi,
    '',
  );

  // Inject CSS <link> before </head>
  if (mainCss) {
    html = html.replace(
      '</head>',
      `  <link rel="stylesheet" crossorigin href="${base}${mainCss}">\n</head>`,
    );
  }

  // Inject JS <script> before </body>
  if (mainScript) {
    html = html.replace(
      '</body>',
      `  <script type="module" crossorigin src="${base}${mainScript}"></script>\n</body>`,
    );
  }

  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf-8');

  // Copy public/ → dist/ if it exists
  const publicDir = path.join(root, 'public');
  if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, outDir, { recursive: true });
  }

  const totalDurationMs = performance.now() - startTime;

  if (!silent) {
    printSPABuildReport(result.metafile!, outDir, assetsDir, totalDurationMs, options.config);
  }

  log.success(`Build completed in ${(totalDurationMs / 1000).toFixed(2)}s`);

  return {
    manifest: buildEmptyManifest(adapter.name, base, 'spa'),
    clientOutputCount: Object.keys(result.metafile!.outputs).length,
    serverOutputCount: 0,
    totalDurationMs,
  };
}