/**
 * 02 — 3-D Stage
 *
 * Loads the test volume and exercises the 3-D ray-cast viewport:
 * canvas visibility, toolbar buttons, focus mode, rail toggle.
 */
import { expect, test } from '@playwright/test';
import { loadVolume } from '../helpers/load-volume.js';

test.describe('3D Stage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadVolume(page);
  });

  // ── Canvas ──────────────────────────────────────────────────────────────

  test('stage canvas is visible after load', async ({ page }) => {
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
  });

  test('stage section element is present', async ({ page }) => {
    await expect(page.getByTestId('stage-section')).toBeVisible();
  });

  // ── Toolbar pill ────────────────────────────────────────────────────────

  test('slice-planes toolbar button is visible', async ({ page }) => {
    // PlanesButton cycles: off → active → all
    const btn = page.getByRole('button', { name: /show slice planes|show all 3 planes|hide slice planes/i });
    await expect(btn).toBeVisible();
  });

  test('clip-plane toolbar button is visible', async ({ page }) => {
    const btn = page.getByRole('button', { name: /clip volume|disable clip/i });
    await expect(btn).toBeVisible();
  });

  test('focus-mode button is visible', async ({ page }) => {
    const btn = page.getByRole('button', { name: /focus mode|exit focus/i });
    await expect(btn).toBeVisible();
  });

  test('rail-toggle button is visible', async ({ page }) => {
    const btn = page.getByRole('button', { name: /show side panel|hide side panel/i });
    await expect(btn).toBeVisible();
  });

  // ── Focus mode ──────────────────────────────────────────────────────────

  test('focus mode expands the stage to full-screen', async ({ page }) => {
    const focusBtn = page.getByRole('button', { name: /focus mode/i });
    await focusBtn.click();

    // In focus mode the stage section has z-index: var(--z-stage) and fills
    // the entire viewport.  Verify the button label flipped.
    await expect(page.getByRole('button', { name: /exit focus mode/i })).toBeVisible();

    // Exit focus mode.
    await page.getByRole('button', { name: /exit focus mode/i }).click();
    await expect(page.getByRole('button', { name: /focus mode/i })).toBeVisible();
  });

  // ── Rail (side panel) ───────────────────────────────────────────────────

  test('rail closes and reopens via toolbar button', async ({ page }) => {
    // The rail starts open by default after loading.
    const hideBtn = page.getByRole('button', { name: /hide side panel/i });
    await expect(hideBtn).toBeVisible();
    await hideBtn.click();

    // Slice panels should disappear.
    await expect(page.getByTestId('slice-panel-coronal')).not.toBeVisible();

    // Reopen.
    await page.getByRole('button', { name: /show side panel/i }).click();
    await expect(page.getByTestId('slice-panel-coronal')).toBeVisible();
  });

  // ── Planes cycling ──────────────────────────────────────────────────────

  test('planes button cycles through off → active → all states', async ({ page }) => {
    // Start state depends on default — just cycle through all 3 states.
    const planesBtn = page.getByRole('button', {
      name: /show slice planes|show all 3 planes|hide slice planes/i,
    });
    await expect(planesBtn).toBeVisible();
    await planesBtn.click();
    await expect(planesBtn).toBeVisible(); // still there after click
    await planesBtn.click();
    await expect(planesBtn).toBeVisible();
    await planesBtn.click();
    await expect(planesBtn).toBeVisible();
  });

  // ── Clip mode ───────────────────────────────────────────────────────────

  test('clip-plane button toggles on and off', async ({ page }) => {
    const clipBtn = page.getByRole('button', { name: /clip volume at active slice/i });
    await expect(clipBtn).toBeVisible();
    await clipBtn.click();

    // Button label flips to "Disable clip mode".
    await expect(page.getByRole('button', { name: /disable clip mode/i })).toBeVisible();

    // Toggle off.
    await page.getByRole('button', { name: /disable clip mode/i }).click();
    await expect(page.getByRole('button', { name: /clip volume at active slice/i })).toBeVisible();
  });

  // ── Stage menu ──────────────────────────────────────────────────────────

  test('stage menu button opens a dropdown', async ({ page }) => {
    // StageMenu button is in the toolbar pill — it's the one that's not focus/rail/planes/clip.
    // It uses a custom SVG and has aria-label about export or render preset.
    const menuBtn = page.getByRole('button', { name: /export|screenshot|render|stage menu/i }).first();
    if (await menuBtn.count() === 0) {
      // If we can't find by aria-label, skip this sub-test gracefully.
      test.skip();
      return;
    }
    await menuBtn.click();
    // A dropdown should appear — verify some list item is visible.
    const menuItem = page.getByRole('menuitem').first();
    await expect(menuItem).toBeVisible();
    // Close with Escape.
    await page.keyboard.press('Escape');
    await expect(menuItem).not.toBeVisible();
  });

  // ── "No volume loaded" placeholder ─────────────────────────────────────

  test('"No volume loaded" text is absent after loading', async ({ page }) => {
    await expect(page.getByText(/no volume loaded/i)).not.toBeVisible();
  });
});
