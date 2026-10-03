/**
 * Pixel reference for the renderers. Each capture is compared pixel-exact
 * (maxDiffPixels: 0) against the baseline written by `npm run ref:capture`.
 *
 * 3-D captures go through the stage menu's PNG export, which renders offscreen
 * at the canvas size — so they hold only the volume, never the DOM chrome on
 * top of it. 2-D captures read the slice canvases directly.
 */
import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { examplePath, openFile, settle } from './helpers';

const VOLUME = examplePath('maxillofacial_CBCT.nrrd');
const PLANES = ['coronal', 'sagittal', 'axial'] as const;

async function export3d(page: Page): Promise<Buffer> {
  await page.getByRole('button', { name: 'Stage options' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /Export 3D view/ }).click();
  const file = await (await download).path();
  return readFileSync(file);
}

async function slicePng(page: Page, plane: (typeof PLANES)[number]): Promise<Buffer> {
  const dataUrl = await page
    .getByTestId(`slice-panel-${plane}`)
    .locator('canvas')
    .first()
    .evaluate((c: HTMLCanvasElement) => c.toDataURL('image/png'));
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

async function setPreset(page: Page, name: 'MIP' | 'Tissue' | 'Bone'): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${name} —`) }).click();
  await settle(page);
}

test('renderers match the reference', async ({ page }) => {
  await page.goto('/');
  await openFile(page, VOLUME);

  await test.step('3-D presets', async () => {
    expect.soft(await export3d(page)).toMatchSnapshot('3d-mip.png');
    await setPreset(page, 'Tissue');
    expect.soft(await export3d(page)).toMatchSnapshot('3d-tissue.png');
    await setPreset(page, 'Bone');
    expect.soft(await export3d(page)).toMatchSnapshot('3d-bone.png');
  });

  await test.step('3-D slice planes + clip', async () => {
    await setPreset(page, 'MIP');
    await page.getByRole('button', { name: /show slice planes/i }).click();
    await page.getByRole('button', { name: /show all 3 planes/i }).click();
    await page.getByRole('button', { name: /clip volume/i }).click();
    await settle(page);
    expect.soft(await export3d(page)).toMatchSnapshot('3d-mip-planes-clip.png');
  });

  await test.step('2-D slices', async () => {
    for (const plane of PLANES) {
      expect.soft(await slicePng(page, plane)).toMatchSnapshot(`2d-${plane}.png`);
    }
  });

  await test.step('2-D slab MIP 5 mm', async () => {
    await page.getByRole('button', { name: '5 mm', exact: true }).first().click();
    await settle(page);
    for (const plane of PLANES) {
      expect.soft(await slicePng(page, plane)).toMatchSnapshot(`2d-slab5-${plane}.png`);
    }
  });
});
