# image-optimization

Demonstrates Pyra's image optimization system: the `pyraImages()` plugin and the `<Image>` component.

## What it covers

| Feature | Where |
|---|---|
| `pyraImages()` plugin config | `pyra.config.ts` |
| `<Image>` component | `src/routes/page.tsx`, `src/routes/gallery/page.tsx` |
| Static prerender | `src/routes/about/page.tsx` (`prerender = true`) |
| Dev on-demand optimization | `/_pyra/image` endpoint (active in `pyra dev`) |
| Prod pre-built variants | `dist/client/_images/` (after `pyra build`) |

## Key concepts

- **`pyraImages(config?)`** — plugin registered in `pyra.config.ts`. Options:
  - `formats` — output formats, e.g. `['webp', 'avif']`
  - `sizes` — width breakpoints in px, e.g. `[480, 960, 1440]`
  - `quality` — compression quality 1–100 (default 80)
- **`<Image src alt width ...>`** — generates a `<picture>` with `<source>` tags per format, plus a fallback `<img>`. Uses `/_pyra/image` for URL construction.
- **Dev**: each unique `src/w/format/q` combination is processed on first request and cached for 60 s. No build step needed.
- **Prod**: `pyra build` scans `public/`, generates every size × format file, records metadata in `dist/manifest.json`. Production server reads the manifest and serves pre-built files with `Cache-Control: public, immutable`.

## Setup

1. Install `sharp` (required for image processing):

   ```bash
   npm install sharp
   ```

2. Add source images to `public/`:

   ```
   public/
     hero.jpg
     portrait.jpg
     product.jpg
   ```

3. Run the dev server:

   ```bash
   pnpm dev
   ```

4. Or build for production:

   ```bash
   pnpm build
   pnpm start
   ```

   After building, inspect `dist/client/_images/` to see the generated variants.
