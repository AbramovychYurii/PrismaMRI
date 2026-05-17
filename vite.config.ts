import path from "node:path";
import { createReadStream, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

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
  plugins: [react(), tailwindcss(), serveExamplesPlugin()],
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
