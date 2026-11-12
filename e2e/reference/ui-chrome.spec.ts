/**
 * Pixel reference for the viewer's chrome — toolbar, menus, rail, dock,
 * findings card, mobile tabs, series switcher — across its main states. Run
 * with the rest of the harness: `ref:capture` before a styling or layout
 * change, `ref:check` after. The WebGL view is left to render.spec.
 */
import { type Page, expect, test } from '@playwright/test';
import { examplePath, openFile, settle } from './helpers';

const VOLUME = examplePath('maxillofacial_CBCT.nrrd');
const DICOM = examplePath('Yurii_Abramovych_Head_Neck_DICOM.zip');

/** The WebGL view is the renderers' business (render.spec); only the DOM is compared. */
const HIDE_3D = '[data-testid="stage-canvas"] { visibility: hidden !important; }';

async function shot(page: Page, name: string, hover = false): Promise<void> {
  if (!hover) await page.mouse.move(1, 899);
  await settle(page, 400);
  await expect(page).toHaveScreenshot(`ui-${name}.png`, {
    animations: 'disabled',
    caret: 'hide',
    style: HIDE_3D,
    maxDiffPixels: 0,
  });
}

test('viewer chrome matches the reference', async ({ page }) => {
  await page.goto('/');
  await openFile(page, VOLUME);
  await shot(page, 'desktop');

  await page.getByRole('button', { name: 'Stage options' }).click();
  await shot(page, 'stage-menu');
  await page.keyboard.press('Escape');

  const coronal = page.getByTestId('slice-panel-coronal').locator('canvas').first();
  const box = await coronal.boundingBox();
  if (!box) throw new Error('no coronal canvas');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await shot(page, 'slice-menu');
  await page.keyboard.press('Escape');

  // Shift-drag measurement → panel dots, line label, status strip.
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await shot(page, 'measurement');

  await page.getByRole('button', { name: /Tissue —/ }).click();
  await shot(page, 'preset-tissue');
  await page.getByRole('button', { name: /MIP —/ }).click();

  await page.getByRole('button', { name: 'Expand panel' }).first().click();
  await shot(page, 'fullscreen');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Focus mode' }).click();
  await shot(page, 'focus');
  await page.getByRole('button', { name: 'Exit focus mode' }).click();

  await page.getByRole('button', { name: 'Hide side panel' }).click();
  await shot(page, 'rail-hidden');
  await page.getByRole('button', { name: 'Show side panel' }).click();

  await page.getByRole('button', { name: 'Hide control panels' }).click();
  await shot(page, 'dock-hidden');
  await page.getByRole('button', { name: 'Show control panels' }).click();

  await page.getByRole('button', { name: 'Focus mode' }).hover();
  await shot(page, 'tooltip', true);

  // Findings: the demo report through the agent panel.
  await page.getByRole('button', { name: /AI Agent/ }).click();
  await page.getByRole('button', { name: /Show example AI report/ }).click();
  await shot(page, 'findings-pill');
  await page.getByRole('button', { name: /AI findings/ }).click();
  await shot(page, 'findings-card');
  await page.getByRole('button', { name: 'Dismiss finding' }).click();
  await shot(page, 'confirm');
  await page.getByRole('button', { name: 'Keep' }).click();
  await page.getByRole('button', { name: 'Close' }).click();

  // Mobile: same session after a reload at phone size.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId('stage-canvas')).toBeVisible({ timeout: 60_000 });
  await shot(page, 'mobile-3d');
  await page.getByRole('tab', { name: 'Coronal', exact: true }).click();
  await shot(page, 'mobile-coronal');
  await page.getByRole('tab', { name: /Controls/ }).click();
  await shot(page, 'mobile-controls');
  await page.getByRole('tab', { name: '3D view' }).click();

  // Series switcher: a multi-series DICOM source.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: /Back to import/ }).click();
  await openFile(page, DICOM);
  await shot(page, 'series-select');
});
