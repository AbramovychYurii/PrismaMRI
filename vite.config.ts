import path from "node:path";
import { createReadStream, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const root = path.dirname(fileURLToPath(import.meta.url));

/** Finds the examples directory with real NRRD files (not LFS pointers). */
function findExamplesDir(): string | null {
  const candidates = [
    path.join(root, "examples"),
    path.join(root, "..", "..", "..", "examples"),
    path.join(root, "..", "examples"),
  ];
  for (const dir of candidates) {
    try {
      const probe = path.join(dir, "maxillofacial_CBCT.nrrd");
      if (statSync(probe).size > 10_000) return dir;
    } catch {
      /* not found */
    }
  }
  return null;
}

/** Dev-only plugin: serves /examples/*.nrrd from the local examples folder. */
function serveExamplesPlugin() {
  const examplesDir = findExamplesDir();
  return {
    name: "serve-examples",
    configureServer(server: {
      middlewares: {
        use: (
          path: string,
          handler: (
            req: { url?: string },
            res: {
              setHeader: (k: string, v: string | number) => void;
              statusCode: number;
              end: () => void;
            },
            next: () => void,
          ) => void,
        ) => void;
      };
    }) {
      if (!examplesDir) return;
      server.middlewares.use("/examples", (req, res, next) => {
        const filename = (req.url ?? "").replace(/^\//, "").split("?")[0];
        if (!filename || filename.includes("..") || !filename.endsWith(".nrrd"))
          return next();
        const filePath = path.join(examplesDir, filename);
        if (!existsSync(filePath)) return next();
        try {
          const stat = statSync(filePath);
          res.setHeader("Content-Length", stat.size);
          res.setHeader("Content-Type", "application/octet-stream");
          res.setHeader("Cache-Control", "public, max-age=86400");
          createReadStream(filePath).pipe(
            res as unknown as NodeJS.WritableStream,
          );
        } catch {
          next();
        }
      });
    },
  };
}
const port = Number(
  (globalThis as { process?: { env?: Record<string, string> } }).process?.env
    ?.PORT,
);

/** Project-site path on GitHub Pages, e.g. /PrismaMRI/ */
const pagesBase =
  process.env.GITHUB_PAGES === "true" && process.env.GITHUB_REPOSITORY_NAME
    ? `/${process.env.GITHUB_REPOSITORY_NAME}/`
    : "/";

export default defineConfig({
  base: pagesBase,
  plugins: [
    react(),
    tailwindcss(),
    serveExamplesPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      // Enable SW in dev so Chrome fires beforeinstallprompt during development.
      // Safe to remove in production — SW is always active in builds.
      devOptions: { enabled: true },
      // Manifest is injected into <head> by the plugin.
      manifest: {
        name: "PrismaMRI · Console",
        short_name: "PrismaMRI",
        description: "Browser-based MRI & CT volume viewer — runs entirely offline",
        theme_color: "#0c0b09",
        background_color: "#0c0b09",
        display: "standalone",
        orientation: "any",
        scope: pagesBase,
        start_url: pagesBase,
        icons: [
          { src: "pwa-64x64.png",          sizes: "64x64",   type: "image/png" },
          { src: "pwa-192x192.png",         sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png",         sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Pre-cache all build assets; skip large binary example files.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        globIgnores: ["**/examples/**"],
        // Never cache DICOM/NIfTI volumes loaded by the user — they come from
        // the local file system (File API) and never hit the network.
        runtimeCaching: [
          {
            // Google Fonts — cache-first, 1-year TTL.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
    },
  },
  worker: { format: "es" },
  server: {
    host: true,
    port: Number.isFinite(port) && port > 0 ? port : 5173,
    strictPort: Number.isFinite(port) && port > 0,
  },
});
