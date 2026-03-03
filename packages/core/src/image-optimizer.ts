import fs from "node:fs";
import type { ImageFormat } from "@pyra-js/shared";

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
}

export interface OptimizeOptions {
  width?: number;
  format?: ImageFormat;
  quality?: number;
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
}

export interface OptimizeResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: ImageFormat;
  size: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SharpModule = any;

let _sharpAvailable: boolean | null = null;
let _sharp: SharpModule | null = null;

async function getSharp(): Promise<SharpModule | null> {
  if (_sharpAvailable !== null) return _sharp;
  try {
    _sharp = await import("sharp" as string);
    _sharpAvailable = true;
  } catch {
    _sharpAvailable = false;
    _sharp = null;
  }
  return _sharp;
}

/**
 * Check whether sharp is installed and importable.
 * Result is cached after the first call.
 */
export async function isSharpAvailable(): Promise<boolean> {
  await getSharp();
  return _sharpAvailable === true;
}

/**
 * Read image dimensions and format without a full decode.
 */
export async function getImageMetadata(inputPath: string): Promise<ImageMetadata> {
  const sharp = await getSharp();
  if (!sharp) {
    throw new Error(
      "[pyra:images] sharp is required for image optimization. Run: npm install sharp"
    );
  }
  const meta = await sharp.default(inputPath).metadata();
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    format: meta.format ?? "unknown",
  };
}

/**
 * Resize and convert a source image to the requested format and quality.
 * Never upscales — if requested width exceeds the original, the original
 * dimensions are preserved.
 */
export async function optimizeImage(
  inputPath: string,
  options: OptimizeOptions
): Promise<OptimizeResult> {
  const sharp = await getSharp();
  if (!sharp) {
    throw new Error(
      "[pyra:images] sharp is required for image optimization. Run: npm install sharp"
    );
  }

  if (!fs.existsSync(inputPath)) {
    throw new Error(`[pyra:images] source image not found: ${inputPath}`);
  }

  const quality = Math.min(100, Math.max(1, options.quality ?? 80));
  const format = options.format ?? "webp";

  let pipeline = sharp.default(inputPath);

  if (options.width) {
    pipeline = pipeline.resize({
      width: options.width,
      withoutEnlargement: true,
      fit: options.fit ?? "inside",
    });
  }

  switch (format) {
    case "webp":
      pipeline = pipeline.webp({ quality });
      break;
    case "avif":
      pipeline = pipeline.avif({ quality });
      break;
    case "jpeg":
      pipeline = pipeline.jpeg({ quality });
      break;
    case "png":
      pipeline = pipeline.png({ quality });
      break;
  }

  const buffer = (await pipeline.toBuffer({ resolveWithObject: false })) as Buffer;
  const meta = await sharp.default(buffer).metadata();

  return {
    buffer,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    format,
    size: buffer.length,
  };
}
