/**
 * Shared helper: intercepts the NRRD network request and returns the tiny
 * synthetic test fixture, then triggers a load via the "Maxilla" example card.
 *
 * The fixture (32×32×32, ~66 KB) loads in < 2 s even in headless CI.
 */
import { type Page, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dir, '../fixtures/test.nrrd');

/**
 * Intercepts every *.nrrd request and fulfills it with the tiny test fixture,
 * then clicks the first example card and waits for the 3-D stage to appear.
 */
export async function loadVolume(page: Page): Promise<void> {
  const body = fs.readFileSync(FIXTURE);

  // Intercept GitHub media CDN and any other NRRD URL.
  await page.route('**/*.nrrd', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body,
    }),
  );

  // Click the first example card.
  await page.getByRole('button', { name: /Load Maxilla/i }).click();

  // Wait until the 3-D stage canvas is mounted — this signals the volume is
  // loaded and the viewer has transitioned out of import mode.
  await expect(page.getByTestId('stage-canvas')).toBeVisible({ timeout: 30_000 });

  // Give the WebGL renderer a tick to paint the first frame.
  await page.waitForTimeout(300);
}
