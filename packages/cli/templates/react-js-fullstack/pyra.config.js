import { createReactAdapter } from '@pyra-js/adapter-react';

/** @type {import('@pyra-js/shared').PyraConfig} */
export default {
  adapter: createReactAdapter(),
  routesDir: 'src/routes',
};
