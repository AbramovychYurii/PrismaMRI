import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number((globalThis as { process?: { env?: Record<string, string> } }).process?.env?.PORT);

/** Project-site path on GitHub Pages, e.g. /PrismaMRI/ */
const pagesBase =
  process.env.GITHUB_PAGES === 'true' && process.env.GITHUB_REPOSITORY_NAME
    ? `/${process.env.GITHUB_REPOSITORY_NAME}/`
    : '/';

export default defineConfig({
  base: pagesBase,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  worker: { format: 'es' },
  server: {
    host: true,
    port: Number.isFinite(port) && port > 0 ? port : 5173,
    strictPort: Number.isFinite(port) && port > 0,
  },
});
