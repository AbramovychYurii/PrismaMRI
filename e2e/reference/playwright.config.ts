import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

/**
 * Reference harness for changes that must not alter what is rendered or how
 * fast a volume loads. Deliberately separate from `test:e2e`:
 *
 *  - it opens the real example volumes from `examples/` (Git LFS, up to 300 MB),
 *    so a run takes minutes rather than seconds;
 *  - its pixel baselines are only meaningful on the machine and GPU stack that
 *    captured them, so they live in a gitignored folder and are never compared
 *    across machines (CI's Linux SwiftShader would not match a Mac).
 *
 *   npm run ref:capture   write the pixel baselines (before a change)
 *   npm run ref:check     pixel-exact compare against them (after a change)
 *   npm run ref:perf      timings + memory → e2e/reference/out/perf-<label>.json
 */
export default defineConfig({
  testDir: here,
  timeout: 15 * 60_000,
  expect: { timeout: 120_000, toMatchSnapshot: { maxDiffPixels: 0 } },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  snapshotPathTemplate: '{testDir}/__baseline__/{arg}{ext}',
  outputDir: path.join(here, 'out/test-results'),
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'npm run preview',
    cwd: root,
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
