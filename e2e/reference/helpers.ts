import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, expect } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));

export function examplePath(file: string): string {
  return path.resolve(here, '../../examples', file);
}

/** Two animation frames: enough for a store change to reach both canvases. */
export async function settle(page: Page, ms = 300): Promise<void> {
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.waitForTimeout(ms);
}

/**
 * Opens `file` through the import screen's "Open file" button — the real user
 * path, with the file handed to the browser by path so nothing is copied
 * through the test runner. Picks the largest series when a picker appears.
 */
export async function openFile(page: Page, file: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /^Open file/ }).click();
  await (await chooser).setFiles(file);

  const picker = page.getByRole('dialog', { name: /series/i });
  const stage = page.getByTestId('stage-canvas');
  await expect(picker.or(stage)).toBeVisible({ timeout: 300_000 });
  if (await picker.isVisible()) {
    await picker
      .getByRole('button', { name: /slices/ })
      .first()
      .click();
  }
  await expect(stage).toBeVisible({ timeout: 300_000 });
  await settle(page);
}

/** Leaves the viewer for the import screen, keeping the session alive. */
export async function backToImport(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Back to import/ }).click();
  await expect(page.getByRole('button', { name: /^Open file/ })).toBeVisible();
}
