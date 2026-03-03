#!/usr/bin/env node
// pyrajs-cli is deprecated — please update your package.json to use @pyra/cli instead.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const binPath = require.resolve('@pyra/cli/bin');
await import(binPath);
