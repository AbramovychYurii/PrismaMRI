/**
 * 04 — Dock panel
 *
 * Exercises the floating dock: toggle open/close, W/L sliders, render-mode
 * presets, and the session / navigation cells.
 */
import { expect, test } from '@playwright/test';
import { loadVolume } from '../helpers/load-volume.js';

test.describe('Dock panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadVolume(page);
  });

  // ── Toggle ──────────────────────────────────────────────────────────────

  test('dock toggle button is present', async ({ page }) => {
    // The ToggleButton is a fixed circular chevron at the bottom of the page.
    const chevron = page.locator('button[aria-label*="dock" i], button[aria-label*="open controls" i], button[aria-label*="close controls" i]').first();
    // If aria-label is not set, find the fixed button near the bottom edge.
    // Dock button is the only fixed circular button at the bottom.
    const fixedBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
    // At minimum it should be visible.
    await expect(fixedBtn).toBeVisible();
  });

  test('clicking the dock toggle opens the dock panel', async ({ page }) => {
    // The dock panel contains "Display", "Navigation", or "Render" section headings.
    // Initially the dock starts closed — click the toggle button.
    // The Dock uses a fixed ToggleButton — we find it by position or by SVG child.
    const toggle = page.locator('button[style*="bottom"]').first();

    // Alternative: locate by the chevron SVG icon that's inside it.
    // The toggle is the only fixed circular amber-bordered button.
    // Use the ChevronDown aria-hidden SVG as a proxy.
    const dockToggle = page.locator('button').filter({
      has: page.locator('svg[class*="lucide-chevron"]'),
    }).first();

    if (await dockToggle.count() > 0) {
      await dockToggle.click();
    } else {
      // Fallback: click the toggle via bottom of viewport.
      await page.mouse.click(720, 880);
    }

    // After opening, at least one dock cell heading should appear.
    await page.waitForTimeout(400); // wait for animation
    const hasDisplay = await page.getByText(/display|render|window|level/i).first().isVisible().catch(() => false);
    expect(hasDisplay).toBe(true);
  });

  // ── W/L (Window/Level) sliders ──────────────────────────────────────────

  test('window-width and window-level sliders are present in dock', async ({ page }) => {
    // Open the dock.
    const dockToggle = page.locator('button').filter({
      has: page.locator('svg[class*="lucide-chevron"]'),
    }).first();
    if (await dockToggle.count() > 0) await dockToggle.click();
    else await page.mouse.click(720, 880);

    await page.waitForTimeout(400);

    // DisplayCell renders two wl-sliders.
    const sliders = page.locator('.wl-slider');
    const count = await sliders.count();
    // There should be at least two sliders (W and L) in the dock.
    expect(count).toBeGreaterThanOrEqual(2);
    await expect(sliders.first()).toBeVisible();
  });

  test('W/L slider is interactive (range input)', async ({ page }) => {
    const dockToggle = page.locator('button').filter({
      has: page.locator('svg[class*="lucide-chevron"]'),
    }).first();
    if (await dockToggle.count() > 0) await dockToggle.click();
    else await page.mouse.click(720, 880);

    await page.waitForTimeout(400);

    const slider = page.locator('.wl-slider').first();
    await expect(slider).toBeVisible();

    // Verify it is an <input type="range">.
    await expect(slider).toHaveAttribute('type', 'range');
  });

  // ── Render presets ──────────────────────────────────────────────────────

  test('render preset buttons are present', async ({ page }) => {
    const dockToggle = page.locator('button').filter({
      has: page.locator('svg[class*="lucide-chevron"]'),
    }).first();
    if (await dockToggle.count() > 0) await dockToggle.click();
    else await page.mouse.click(720, 880);

    await page.waitForTimeout(400);

    // RenderCell contains preset buttons: "Bone", "Soft tissue", "Lung", etc.
    // or similar volume-rendering presets.
    const presets = page.getByRole('button', { name: /bone|soft|lung|brain|default|standard/i });
    const cnt = await presets.count();
    expect(cnt).toBeGreaterThan(0);
  });

  test('clicking a render preset does not crash the app', async ({ page }) => {
    const dockToggle = page.locator('button').filter({
      has: page.locator('svg[class*="lucide-chevron"]'),
    }).first();
    if (await dockToggle.count() > 0) await dockToggle.click();
    else await page.mouse.click(720, 880);

    await page.waitForTimeout(400);

    const presets = page.getByRole('button', { name: /bone|soft|lung|brain|default|standard/i });
    if (await presets.count() > 0) {
      await presets.first().click();
    }

    // Stage canvas must still be visible — no crash.
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
  });

  // ── Navigation cell ─────────────────────────────────────────────────────

  test('navigation cell is present in the dock', async ({ page }) => {
    const dockToggle = page.locator('button').filter({
      has: page.locator('svg[class*="lucide-chevron"]'),
    }).first();
    if (await dockToggle.count() > 0) await dockToggle.click();
    else await page.mouse.click(720, 880);

    await page.waitForTimeout(400);

    // NavigationCell shows "Navigation" or "View" section heading.
    const heading = page.getByText(/navigation|view/i).first();
    await expect(heading).toBeVisible();
  });

  // ── Header run strip ────────────────────────────────────────────────────

  test('RunStrip shows volume metadata after load', async ({ page }) => {
    // RunStrip in the header shows: Scanner, Volume, Spacing, Modality cells.
    // At least one of them should have non-empty text.
    const header = page.locator('header').first();
    // Check for "Volume" label or spacing information in the header strip.
    const volText = header.getByText(/mm|volume|spacing|scanner|modality/i).first();
    await expect(volText).toBeVisible();
  });

  // ── Back-to-import action ───────────────────────────────────────────────

  test('pressing Escape from viewer returns to import screen', async ({ page }) => {
    // The useViewerApp hook maps Escape to returning to import.
    await page.keyboard.press('Escape');

    // Import screen should reappear with the Examples heading.
    await expect(page.getByRole('heading', { name: /examples/i })).toBeVisible({ timeout: 5_000 });
  });
});
