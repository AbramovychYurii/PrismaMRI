import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Deliberately separate from vite.config.ts.
 *
 * The app config pulls in React, Tailwind and the PWA plugin — none of which a
 * pure-function test needs, and all of which slow the run down. The only thing
 * shared is the `@` alias, so the tests import modules exactly the way the app
 * does.
 *
 * `node` is the default environment because everything under test is pure
 * arithmetic. The one file that needs a DOM (the store, for sessionStorage)
 * opts in with a `@vitest-environment jsdom` docblock.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(root, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
});
