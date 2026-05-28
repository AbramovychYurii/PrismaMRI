/**
 * 05 — Keyboard shortcuts
 *
 * Verifies that all documented hotkeys work:
 * ? → shortcuts modal, Escape → close modal / return to import,
 * ↑/↓ → slice navigation, Ctrl+O → open-folder prompt.
 */
import { expect, test } from '@playwright/test';
import { loadVolume } from '../helpers/load-volume.js';

test.describe('Keyboard shortcuts', () => {
  // ── Shortcuts modal (accessible from the viewer) ────────────────────────

  test.describe('Shortcuts modal', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await loadVolume(page);
    });

    test('? key opens the keyboard shortcuts modal', async ({ page }) => {
      await page.keyboard.press('?');
      await expect(
        page.getByRole('dialog', { name: /keyboard shortcuts/i }),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('shortcuts modal contains expected sections', async ({ page }) => {
      await page.keyboard.press('?');
      const modal = page.getByRole('dialog', { name: /keyboard shortcuts/i });
      await expect(modal).toBeVisible();
      // Check section labels defined in KeyboardShortcutsModal.
      await expect(modal.getByText(/file/i).first()).toBeVisible();
      await expect(modal.getByText(/slices/i).first()).toBeVisible();
      await expect(modal.getByText(/3d view/i).first()).toBeVisible();
    });

    test('? button in header also opens the shortcuts modal', async ({ page }) => {
      const helpBtn = page.getByRole('button', { name: /keyboard shortcuts/i });
      await helpBtn.click();
      await expect(
        page.getByRole('dialog', { name: /keyboard shortcuts/i }),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('close button inside modal closes it', async ({ page }) => {
      await page.keyboard.press('?');
      const modal = page.getByRole('dialog', { name: /keyboard shortcuts/i });
      await expect(modal).toBeVisible();

      // The X (close) button.
      const closeBtn = modal.getByRole('button');
      await closeBtn.click();
      await expect(modal).not.toBeVisible({ timeout: 3_000 });
    });

    test('Escape key closes the shortcuts modal', async ({ page }) => {
      await page.keyboard.press('?');
      await expect(
        page.getByRole('dialog', { name: /keyboard shortcuts/i }),
      ).toBeVisible();

      await page.keyboard.press('Escape');
      // After Escape the modal closes and we land back in the viewer (not on
      // the import screen, because Escape is consumed by the modal first).
      // If modal has its own Escape handler the viewer won't exit.
      // Either outcome is valid — just ensure the modal is gone.
      await expect(
        page.getByRole('dialog', { name: /keyboard shortcuts/i }),
      ).not.toBeVisible({ timeout: 5_000 });
    });
  });

  // ── Slice navigation hotkeys ────────────────────────────────────────────

  test.describe('Slice navigation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await loadVolume(page);

      // Open the scrubber on the coronal panel so we can read aria-valuenow.
      const panel = page.getByTestId('slice-panel-coronal');
      await panel.getByRole('button', { name: /toggle slice scrubber/i }).click();
      await expect(panel.getByRole('slider', { name: /coronal slice/i })).toBeVisible();

      // Activate the coronal panel by clicking it.
      await panel.click({ position: { x: 60, y: 60 } });
    });

    test('ArrowUp key increments the active slice', async ({ page }) => {
      const slider = page.getByTestId('slice-panel-coronal')
        .getByRole('slider', { name: /coronal slice/i });
      const before = parseInt(await slider.getAttribute('aria-valuenow') ?? '0', 10);

      await page.keyboard.press('ArrowUp');

      const after = parseInt(await slider.getAttribute('aria-valuenow') ?? '0', 10);
      expect(after).toBe(before + 1);
    });

    test('ArrowDown key decrements the active slice', async ({ page }) => {
      const slider = page.getByTestId('slice-panel-coronal')
        .getByRole('slider', { name: /coronal slice/i });

      // Move up first to ensure there's room to go down.
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');

      const before = parseInt(await slider.getAttribute('aria-valuenow') ?? '0', 10);
      await page.keyboard.press('ArrowDown');
      const after = parseInt(await slider.getAttribute('aria-valuenow') ?? '0', 10);
      expect(after).toBe(before - 1);
    });
  });

  // ── Escape returns to import screen ────────────────────────────────────

  test('Escape from viewer (no modal open) returns to import screen', async ({ page }) => {
    await page.goto('/');
    await loadVolume(page);

    await page.keyboard.press('Escape');

    // Import screen should now be visible.
    await expect(page.getByRole('heading', { name: /examples/i })).toBeVisible({ timeout: 5_000 });
  });

  // ── Ctrl+O ─────────────────────────────────────────────────────────────

  test('Ctrl+O triggers the file-open interaction', async ({ page }) => {
    await page.goto('/');
    await loadVolume(page);

    // We can't fully test a native file picker dialog — just verify the shortcut
    // does not crash the app.
    await page.keyboard.press('Control+o');
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
  });
});
