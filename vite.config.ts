import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number((globalThis as { process?: { env?: Record<string, string> } }).process?.env?.PORT);

export default defineConfig({
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
