/**
 * 03 — 2-D Slice panels
 *
 * Exercises all three slice panels (coronal, sagittal, axial):
 * visibility, scrubber chevrons, expand/collapse, slab MIP buttons,
 * and the context-menu measurement flow.
 */
import { expect, test } from '@playwright/test';
import { loadVolume } from '../helpers/load-volume.js';

test.describe('Slice panels', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadVolume(page);
    // Ensure rail is open (it opens by default after load).
    await expect(page.getByTestId('slice-panel-coronal')).toBeVisible();
  });

  // ── Visibility ──────────────────────────────────────────────────────────

  test('all three slice panels are visible', async ({ page }) => {
    await expect(page.getByTestId('slice-panel-coronal')).toBeVisible();
    await expect(page.getByTestId('slice-panel-sagittal')).toBeVisible();
    await expect(page.getByTestId('slice-panel-axial')).toBeVisible();
  });

  test('each slice panel contains a canvas', async ({ page }) => {
    for (const plane of ['coronal', 'sagittal', 'axial']) {
      const panel = page.getByTestId(`slice-panel-${plane}`);
      await expect(panel.locator('canvas')).toBeVisible();
    }
  });

  // ── Plane labels ────────────────────────────────────────────────────────

  test('panel headers show plane names', async ({ page }) => {
    const rail = page.locator('aside');
    await expect(rail.getByText(/coronal/i).first()).toBeVisible();
    await expect(rail.getByText(/sagittal/i).first()).toBeVisible();
    await expect(rail.getByText(/axial/i).first()).toBeVisible();
  });

  // ── Scrubber toggle ─────────────────────────────────────────────────────
  // The store initialises scrubVisible=true for all planes, so the scrubber
  // starts OPEN.  One click closes it; a second click opens it again.

  test('scrubber starts open and toggle button closes it', async ({ page }) => {
    const panel = page.getByTestId('slice-panel-coronal');
    const scrubber = page.getByTestId('scrubber-coronal');

    // Scrubber visible from the start.
    await expect(scrubber).toHaveCSS('opacity', '1');

    // Toggle closes it.
    const toggleBtn = panel.getByRole('button', { name: /toggle slice scrubber/i });
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();

    // Wait for the 160 ms CSS transition to finish.
    await expect(scrubber).toHaveCSS('opacity', '0', { timeout: 1_000 });
  });

  test('second toggle re-opens the scrubber', async ({ page }) => {
    const panel = page.getByTestId('slice-panel-coronal');
    const scrubber = page.getByTestId('scrubber-coronal');
    const toggleBtn = panel.getByRole('button', { name: /toggle slice scrubber/i });

    // Close then re-open.
    await toggleBtn.click();
    await expect(scrubber).toHaveCSS('opacity', '0', { timeout: 1_000 });
    await toggleBtn.click();
    await expect(scrubber).toHaveCSS('opacity', '1', { timeout: 1_000 });
  });

  // ── Scrubber chevrons ───────────────────────────────────────────────────
  // The scrubber starts open — chevrons are directly clickable without toggling.

  test('scrubber "next slice" chevron increments the slice counter', async ({ page }) => {
    const panel = page.getByTestId('slice-panel-coronal');

    // Scrubber is already open; verify slider is accessible.
    await expect(page.getByTestId('scrubber-coronal')).toHaveCSS('opacity', '1');
    const slider = panel.getByRole('slider', { name: /coronal slice/i });
    const before = parseInt(await slider.getAttribute('aria-valuenow') ?? '0', 10);

    // dispatchEvent bypasses all browser hit-testing and fires directly on the
    // button element — reliable even when the canvas overlaps visually.
    await panel.getByRole('button', { name: /next slice/i }).dispatchEvent('pointerdown');
    await panel.getByRole('button', { name: /next slice/i }).dispatchEvent('pointerup');

    const after = parseInt(await slider.getAttribute('aria-valuenow') ?? '0', 10);
    expect(after).toBe(before + 1);
  });

  test('scrubber "previous slice" chevron decrements the slice counter', async ({ page }) => {
    const panel = page.getByTestId('slice-panel-coronal');

    await expect(page.getByTestId('scrubber-coronal')).toHaveCSS('opacity', '1');
    const slider = panel.getByRole('slider', { name: /coronal slice/i });

    // Step forward twice to ensure there is room to step back.
    await panel.getByRole('button', { name: /next slice/i }).dispatchEvent('pointerdown');
    await panel.getByRole('button', { name: /next slice/i }).dispatchEvent('pointerup');
    await panel.getByRole('button', { name: /next slice/i }).dispatchEvent('pointerdown');
    await panel.getByRole('button', { name: /next slice/i }).dispatchEvent('pointerup');

    const before = parseInt(await slider.getAttribute('aria-valuenow') ?? '0', 10);
    await panel.getByRole('button', { name: /previous slice/i }).dispatchEvent('pointerdown');
    await panel.getByRole('button', { name: /previous slice/i }).dispatchEvent('pointerup');
    const after = parseInt(await slider.getAttribute('aria-valuenow') ?? '0', 10);
    expect(after).toBe(before - 1);
  });

  test('scrubber aria attributes are correct (min=1, orientation=vertical)', async ({ page }) => {
    const panel = page.getByTestId('slice-panel-coronal');
    await panel.getByRole('button', { name: /toggle slice scrubber/i }).click();

    const slider = panel.getByRole('slider', { name: /coronal slice/i });
    await expect(slider).toHaveAttribute('aria-valuemin', '1');
    await expect(slider).toHaveAttribute('aria-orientation', 'vertical');

    const max = parseInt((await slider.getAttribute('aria-valuemax')) ?? '0', 10);
    expect(max).toBeGreaterThan(0);
  });

  // ── Expand / collapse ───────────────────────────────────────────────────

  test('expand button opens the fullscreen panel', async ({ page }) => {
    const panel = page.getByTestId('slice-panel-coronal');
    await panel.getByRole('button', { name: /expand panel/i }).click();

    // Expanded panel renders a close/minimize button.
    await expect(
      page.getByRole('button', { name: /collapse|close panel|minimize/i }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('expanded panel can be closed', async ({ page }) => {
    const panel = page.getByTestId('slice-panel-coronal');
    await panel.getByRole('button', { name: /expand panel/i }).click();

    const closeBtn = page.getByRole('button', { name: /collapse|close panel|minimize/i }).first();
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    await expect(panel).toBeVisible({ timeout: 5_000 });
  });

  // ── Slice download button ───────────────────────────────────────────────

  test('expand panel has a download-slice button', async ({ page }) => {
    const panel = page.getByTestId('slice-panel-coronal');
    await panel.getByRole('button', { name: /expand panel/i }).click();

    await expect(
      page.getByRole('button', { name: /export slice as png/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── Slab MIP ────────────────────────────────────────────────────────────
  // Slab MIP now lives in the dock's Render Mode cell, not in the expanded
  // slice panel — controlled centrally so it applies to every panel.

  async function openDock(page: import('@playwright/test').Page) {
    // Mirror the working pattern from 04-dock.spec.ts.
    const dockToggle = page
      .locator('button')
      .filter({ has: page.locator('svg[class*="lucide-chevron"]') })
      .first();
    if (await dockToggle.count() > 0) await dockToggle.click();
    else await page.mouse.click(720, 880);
    await page.waitForTimeout(500);
    // Wait until a Dock cell heading appears so the rest of the test is stable.
    await expect(page.getByText(/render mode/i).first()).toBeVisible({ timeout: 3_000 });
  }

  test('slab MIP presets are visible in the dock', async ({ page }) => {
    await openDock(page);
    // Buttons render their label as plain text — find them by text.
    await expect(page.locator('button', { hasText: /^Off$/ }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button', { hasText: /^3 mm$/ }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: /^5 mm$/ }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: /^10 mm$/ }).first()).toBeVisible();
  });

  test('clicking a slab MIP preset does not crash the app', async ({ page }) => {
    await openDock(page);
    const preset5 = page.locator('button', { hasText: /^5 mm$/ }).first();
    await expect(preset5).toBeVisible({ timeout: 5_000 });
    await preset5.click();
    // Still visible — no crash; the button now reports pressed=true.
    await expect(preset5).toBeVisible();
    await expect(preset5).toHaveAttribute('aria-pressed', 'true');
  });

  // ── Measurement context menu ────────────────────────────────────────────

  test('right-click on an active panel opens the measure menu', async ({ page }) => {
    const panel = page.getByTestId('slice-panel-coronal');

    // First click activates the panel (transitions from pointer to crosshair mode).
    await panel.click({ position: { x: 50, y: 50 } });
    // Second click — now panel is active; sets the crosshair position.
    await panel.click({ position: { x: 80, y: 80 } });

    // Right-click triggers the context menu.
    await panel.click({ button: 'right', position: { x: 80, y: 80 } });

    // MeasureMenu renders <button>s (not role=menuitem). The first item is
    // "Measure from here".
    await expect(
      page.getByRole('button', { name: /measure from here/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('pressing Escape closes the measure context menu', async ({ page }) => {
    const panel = page.getByTestId('slice-panel-coronal');
    await panel.click({ position: { x: 50, y: 50 } });
    await panel.click({ position: { x: 80, y: 80 } });
    await panel.click({ button: 'right', position: { x: 80, y: 80 } });

    await expect(
      page.getByRole('button', { name: /measure from here/i }),
    ).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');

    await expect(
      page.getByRole('button', { name: /measure from here/i }),
    ).not.toBeVisible({ timeout: 3_000 });
  });
});
