import { defineConfig } from '@pyra-js/cli';
import { createReactAdapter } from '@pyra-js/adapter-react';

export default defineConfig({
  adapter: createReactAdapter(),
  routesDir: 'src/routes',
});
