/**
 * 07 — 3-D render snapshots
 *
 * Visual-regression guard for the volume ray-cast shader
 * (src/lib/volume/three-preview/volume-shader.ts) — the densest, most
 * refactor-prone code in the project. Loads the synthetic test volume and
 * snapshots the 3-D stage in each render preset (MIP / Tissue / Bone), so an
 * accidental change to the GLSL (lighting, AO, shadows, pre-integrated TF,
 * compositing) is caught here instead of slipping through review unnoticed.
 *
 * Determinism: the ray jitter and 8-bit dither are hashed off gl_FragCoord, so
 * a fixed volume + camera renders byte-identically on a given machine. That
 * makes the snapshot stable locally; `maxDiffPixelRatio` only absorbs minor
 * GPU/driver noise.
 *
 * ⚠ Baselines are PLATFORM-SPECIFIC — Playwright appends an OS suffix
 * (…-darwin.png, …-linux.png) because WebGL output differs by GPU/driver. The
 * committed baseline is whatever machine last ran:
 *     npm run test:e2e:update
 * CI on a different OS needs its own baseline generated once on that OS (or the
 * snapshot step gated to the platform the baseline was captured on).
 */
import { expect, test } from '@playwright/test';
import { loadVolume } from '../helpers/load-volume.js';

const PRESETS = ['MIP', 'Tissue', 'Bone'] as const;

test.describe('3D render snapshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadVolume(page);
  });

  for (const preset of PRESETS) {
    test(`3D stage renders the ${preset} preset`, async ({ page }) => {
      // Switch preset (MIP is the default but click anyway for an explicit state).
      await page.getByRole('button', { name: new RegExp(`^${preset}`, 'i') }).click();

      // DVR presets (Tissue/Bone) recompose with the full lighting/AO/shadow
      // stack; give the renderer a beat to settle on the final still frame.
      await page.waitForTimeout(800);

      await expect(page.getByTestId('stage-canvas')).toHaveScreenshot(
        `render-${preset.toLowerCase()}.png`,
        {
          // The render is per-pixel deterministic on a given machine, so we can
          // run tight: `threshold` (per-pixel sensitivity) is dropped well below
          // the 0.2 default so a tonal shift (e.g. EXPOSURE/lighting tweak) is
          // caught, and `maxDiffPixelRatio` leaves only a sliver for driver
          // noise. Loosen both if a real GPU produces flaky diffs.
          threshold: 0.1,
          maxDiffPixelRatio: 0.005,
          animations: 'disabled',
        },
      );
    });
  }
});
