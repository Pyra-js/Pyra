/**
 * Graph command - visualize dependency graph
 */

import { resolve, join, dirname } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { log } from 'pyrajs-shared';
import type { GraphOptions } from '../graph/types.js';
import { buildGraph, filterGraph, markCycles } from '../graph/buildGraph.js';
import { parseLockfile, enrichGraphWithLockfile } from '../graph/parseLockfile.js';
import { serializeJson } from '../graph/serialize/json.js';
import { serializeMermaid } from '../graph/serialize/mermaid.js';
import { serializeDot } from '../graph/serialize/dot.js';
import { serializeHtml } from '../graph/serialize/html.js';
import { StaticServer, openBrowser } from '../graph/staticServer.js';

export async function graphCommand(options: GraphOptions): Promise<void> {
  const rootPath = resolve(options.path || process.cwd());

  if (!options.silent) {
    log.info('Analyzing dependency graph...');
  }

  try {
    // Build graph
    const graph = await buildGraph({
      rootPath,
      packageManager: options.pm,
    });

    // Parse lockfile for resolved versions
    const lockfile = parseLockfile(rootPath);
    if (lockfile.type !== 'none') {
      enrichGraphWithLockfile(graph, lockfile);
      if (!options.silent) {
        log.success(`Parsed ${lockfile.type} lockfile`);
      }
    }

    // Detect cycles if requested
    if (options.cycles) {
      markCycles(graph);
      const cycleCount = graph.edges.filter(e => e.circular).length;
      if (cycleCount > 0) {
        log.warn(`Found ${cycleCount} circular dependencies`);
      }
    }

    // Apply filters
    const filteredGraph = filterGraph(graph, {
      internalOnly: options.internalOnly,
      externalOnly: options.externalOnly,
      hideDev: options.hideDev,
      hidePeer: options.hidePeer,
      hideOptional: options.hideOptional,
      filter: options.filter,
      maxDepth: options.maxDepth,
    });

    if (!options.silent) {
      log.info(
        `Graph: ${filteredGraph.nodes.length} nodes, ${filteredGraph.edges.length} edges`
      );
    }

    // Output JSON directly if requested
    if (options.json) {
      console.log(serializeJson(filteredGraph));
      return;
    }

    // Determine output format and file
    const format = options.format || 'html';
    let output: string;
    let extension: string;

    switch (format) {
      case 'mermaid':
        output = serializeMermaid(filteredGraph);
        extension = 'mmd';
        break;

      case 'dot':
        output = serializeDot(filteredGraph);
        extension = 'dot';
        break;

      case 'json':
        output = serializeJson(filteredGraph);
        extension = 'json';
        break;

      case 'html':
      default:
        output = serializeHtml(filteredGraph);
        extension = 'html';
        break;
    }

    // Determine output path
    const defaultDir = join(rootPath, '.pyra', 'graph');
    const defaultFile = join(defaultDir, `index.${extension}`);
    const outfile = options.outfile || defaultFile;

    // Write to file or stdout
    if (format === 'mermaid' || format === 'dot') {
      // Text formats can go to stdout if no outfile specified
      if (!options.outfile) {
        console.log(output);
        return;
      }
    }

    // Ensure directory exists
    const outDir = dirname(outfile);
    if (outDir && !existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    // Write file
    writeFileSync(outfile, output, 'utf-8');

    if (!options.silent) {
      log.success(`Graph written to ${outfile}`);
    }

    // Open in browser if HTML and --open
    if (format === 'html' && options.open !== false) {
      const isTTY = process.stdout.isTTY;
      const shouldOpen = options.open === true || (options.open === undefined && isTTY);

      if (shouldOpen) {
        try {
          const server = new StaticServer({ root: outDir });
          const url = await server.start();

          if (!options.silent) {
            log.info(`Starting static server at ${url}`);
          }

          await openBrowser(url);

          if (!options.silent) {
            log.success('Opened in browser');
            log.info('Press Ctrl+C to stop server');
          }

          // Keep server running
          process.on('SIGINT', async () => {
            await server.stop();
            process.exit(0);
          });
        } catch (error) {
          log.warn(`Failed to start server: ${error}`);
          log.info(`Open manually: ${outfile}`);
        }
      }
    }
  } catch (error) {
    log.error(`Failed to generate graph: ${error}`);
    throw error;
  }
}
