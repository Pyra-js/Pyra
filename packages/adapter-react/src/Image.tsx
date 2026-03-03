import React from "react";
import type { ImageFormat } from "@pyra-js/shared";

export interface ImageProps {
  /** URL path to the source image (e.g. '/images/hero.jpg'). Must be served from public/. */
  src: string;
  /** Alt text for accessibility. */
  alt: string;
  /** Intrinsic display width in pixels. */
  width?: number;
  /** Intrinsic display height in pixels. */
  height?: number;
  /**
   * CSS sizes attribute describing layout width at each breakpoint.
   * Default: "100vw"
   */
  sizes?: string;
  /**
   * Output formats to request, ordered best-first.
   * Default: ['avif', 'webp'] — browser picks the first it supports.
   */
  formats?: ImageFormat[];
  /**
   * Responsive width breakpoints. The /_pyra/image endpoint generates a
   * variant for each width. Default: [640, 1280, 1920].
   */
  widths?: number[];
  /** Compression quality 1–100 passed to the optimizer. Default: 80. */
  quality?: number;
  /** Browser loading behaviour. Default: 'lazy'. */
  loading?: "lazy" | "eager";
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULT_FORMATS: ImageFormat[] = ["avif", "webp"];
const DEFAULT_WIDTHS = [640, 1280, 1920];

function buildSrc(src: string, width: number, format: ImageFormat, quality: number): string {
  const params = new URLSearchParams({ src, w: String(width), format, q: String(quality) });
  return `/_pyra/image?${params.toString()}`;
}

/**
 * Framework-agnostic image component for Pyra.
 *
 * Generates a <picture> element with <source> tags for modern formats
 * (avif, webp) and an <img> fallback pointing to the original file.
 *
 * In development, images are optimized on-demand via the /_pyra/image endpoint.
 * In production, pre-built variants are served with immutable cache headers.
 *
 * Requires the `pyraImages()` plugin in pyra.config.ts.
 *
 * @example
 * <Image src="/images/hero.jpg" alt="Hero" width={1280} height={720} />
 */
export function Image({
  src,
  alt,
  width,
  height,
  sizes = "100vw",
  formats = DEFAULT_FORMATS,
  widths = DEFAULT_WIDTHS,
  quality = 80,
  loading = "lazy",
  className,
  style,
}: ImageProps): React.ReactElement {
  return (
    <picture>
      {formats.map((format) => {
        const srcset = widths
          .map((w) => `${buildSrc(src, w, format, quality)} ${w}w`)
          .join(", ");
        return (
          <source
            key={format}
            srcSet={srcset}
            sizes={sizes}
            type={`image/${format}`}
          />
        );
      })}
      {/* Original image as ultimate fallback (no optimization) */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        sizes={sizes}
        className={className}
        style={style}
      />
    </picture>
  );
}
