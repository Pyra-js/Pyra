import { defineConfig } from '@pyra-js/cli';
import { createReactAdapter } from '@pyra-js/adapter-react';
import { pyraImages } from '@pyra-js/core';

export default defineConfig({
  adapter: createReactAdapter(),
  routesDir: 'src/routes',
  plugins: [
    pyraImages({
      // Output formats to generate for every source image.
      formats: ['webp', 'avif'],
      // Widths (px) to generate. The <Image> component picks the best fit.
      sizes: [480, 960, 1440],
      // JPEG/WebP/AVIF compression quality (1–100).
      quality: 80,
    }),
  ],
});
