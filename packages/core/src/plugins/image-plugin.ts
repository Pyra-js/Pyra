import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { log } from "pyrajs-shared";
import type { ImageConfig, ImageFormat, ImageManifestEntry, PyraConfig, PyraPlugin, RouteManifest } from "pyrajs-shared";
import { getImageMetadata, isSharpAvailable, optimizeImage } from "../image-optimizer.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"]);

const DEFAULT_FORMATS: ImageFormat[] = ["webp"];
const DEFAULT_SIZES = [640, 1280, 1920];
const DEFAULT_QUALITY = 80;

function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/** Recursively collect image files under a directory. */
function collectImages(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectImages(fullPath));
    } else if (entry.isFile() && isImageFile(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Stable 8-char hex hash of a file's contents. */
function contentHash(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

/**
 * Opt-in image optimization plugin for Pyra.
 *
 * @example
 * // pyra.config.ts
 * import { pyraImages } from 'pyrajs-core';
 * export default {
 *   plugins: [pyraImages({ formats: ['webp', 'avif'], sizes: [640, 1280] })]
 * };
 */
export function pyraImages(imageConfig: ImageConfig = {}): PyraPlugin {
  const formats: ImageFormat[] = imageConfig.formats ?? DEFAULT_FORMATS;
  const sizes: number[] = imageConfig.sizes ?? DEFAULT_SIZES;
  const quality: number = imageConfig.quality ?? DEFAULT_QUALITY;

  // Resolved at config/setup time
  let resolvedConfig: PyraConfig = {};
  let resolvedMode: string = "production";
  let sharpAvailable = false;

  // Populated during buildStart, consumed in buildEnd
  const builtImages: Record<string, ImageManifestEntry> = {};

  return {
    name: "pyra:images",

    config(userConfig) {
      resolvedConfig = userConfig;
      return null;
    },

    async setup(api) {
      resolvedConfig = api.getConfig();
      resolvedMode = api.getMode();
      sharpAvailable = await isSharpAvailable();
      if (!sharpAvailable) {
        log.warn(
          "[pyra:images] sharp not installed — image optimization disabled. Run: npm install sharp"
        );
      }
    },

    async buildStart() {
      if (!sharpAvailable) return;

      const root = resolvedConfig.root ?? process.cwd();
      const publicDir = resolvedConfig.build?.publicDir ?? "public";
      const outDir = resolvedConfig.build?.outDir ?? resolvedConfig.outDir ?? "dist";
      const absolutePublicDir = path.resolve(root, publicDir);
      const absoluteOutDir = path.resolve(root, outDir);
      const imagesOutDir = path.join(absoluteOutDir, "client", "_images");

      fs.mkdirSync(imagesOutDir, { recursive: true });

      const imageFiles = collectImages(absolutePublicDir);
      if (imageFiles.length === 0) return;

      let variantCount = 0;

      for (const absPath of imageFiles) {
        // src is the URL path relative to the project (e.g. /images/hero.jpg)
        const relToPublic = path.relative(absolutePublicDir, absPath);
        const srcKey = "/" + relToPublic.replace(/\\/g, "/");

        let meta: { width: number; height: number; format: string };
        try {
          meta = await getImageMetadata(absPath);
        } catch {
          log.warn(`[pyra:images] skipping ${srcKey} — could not read metadata`);
          continue;
        }

        const entry: ImageManifestEntry = {
          src: srcKey,
          originalWidth: meta.width,
          originalHeight: meta.height,
          originalFormat: meta.format,
          variants: {},
        };

        for (const format of formats) {
          for (const width of sizes) {
            // Never upscale
            if (width > meta.width) continue;

            try {
              const result = await optimizeImage(absPath, { width, format, quality });
              const hash = contentHash(result.buffer);
              const stem = path.basename(absPath, path.extname(absPath));
              const filename = `${stem}-${hash}-${width}w.${format}`;
              const destPath = path.join(imagesOutDir, filename);

              fs.writeFileSync(destPath, result.buffer);

              const variantKey = `${width}:${format}`;
              entry.variants[variantKey] = {
                path: `_images/${filename}`,
                width: result.width,
                format,
                size: result.size,
              };
              variantCount++;
            } catch (err) {
              log.warn(
                `[pyra:images] failed to optimize ${srcKey} at ${width}w/${format}: ${(err as Error).message}`
              );
            }
          }
        }

        builtImages[srcKey] = entry;
      }

      if (imageFiles.length > 0) {
        log.success(
          `[pyra:images] optimized ${imageFiles.length} image${imageFiles.length !== 1 ? "s" : ""} (${variantCount} variant${variantCount !== 1 ? "s" : ""})`
        );
      }
    },

    buildEnd(ctx: { manifest: RouteManifest; outDir: string; root: string }) {
      if (Object.keys(builtImages).length > 0) {
        ctx.manifest.images = builtImages;
      }
    },
  };
}
