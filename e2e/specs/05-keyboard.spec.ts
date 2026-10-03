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

  // ── Escape does NOT return to import screen ────────────────────────────
  //
  // Esc used to be a hidden hotkey for "back to import" but the only escape
  // from a loaded volume is now an explicit click on the SessionCell button.
  // This guards against a regression where a stray Esc would dump the user
  // out of a long-loaded study.

  test('Escape from viewer (no modal open) keeps the user on the viewer', async ({ page }) => {
    await page.goto('/');
    await loadVolume(page);

    await page.keyboard.press('Escape');

    // Give any (incorrect) navigation a brief window to happen; viewer should
    // still be mounted and the Examples heading should NOT appear.
    await page.waitForTimeout(500);
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await expect(page.getByRole('heading', { name: /examples/i })).toHaveCount(0);
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

  // ── Slice panels without a mouse ────────────────────────────────────────

  test.describe('Slice panel keyboard access', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await loadVolume(page);
    });

    test('Shift+arrows move the crosshair within the focused plane', async ({ page }) => {
      const sagittalSlice = page.getByRole('slider', { name: /sagittal slice/i }).first();
      const before = Number(await sagittalSlice.getAttribute('aria-valuenow'));

      // Axial is drawn x → right, so Shift+→ steps x — the sagittal slice index.
      await page.getByRole('group', { name: /^axial slice/i }).focus();
      await page.keyboard.press('Shift+ArrowRight');
      await expect(sagittalSlice).toHaveAttribute('aria-valuenow', String(before + 1));
    });

    test('Shift+F10 opens the measure menu at the crosshair', async ({ page }) => {
      await page.getByRole('group', { name: /^coronal slice/i }).focus();
      await page.keyboard.press('Shift+F10');
      const menu = page.getByRole('menu', { name: 'Slice actions' });
      await expect(menu).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: /measure from here/i })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(menu).not.toBeVisible();
    });
  });

  // ── Arrow keys that belong to a control ─────────────────────────────────

  test.describe('Arrow keys inside controls', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await loadVolume(page);
    });

    test('↑/↓ in a menu move through it without stepping the slice', async ({ page }) => {
      const coronal = page.getByRole('slider', { name: /coronal slice/i }).first();
      const before = await coronal.getAttribute('aria-valuenow');
      await page.getByRole('button', { name: 'Stage options' }).focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowUp');
      await expect(coronal).toHaveAttribute('aria-valuenow', String(before));
    });

    test('↑/↓ on the Window slider change W/L, not the slice', async ({ page }) => {
      const coronal = page.getByRole('slider', { name: /coronal slice/i }).first();
      const before = await coronal.getAttribute('aria-valuenow');
      await page.getByRole('slider', { name: 'Window' }).focus();
      await page.keyboard.press('ArrowUp');
      await expect(coronal).toHaveAttribute('aria-valuenow', String(before));
    });
  });

  test.describe('Slice scrubber', () => {
    test('Home and End jump to the first and last slice', async ({ page }) => {
      await page.goto('/');
      await loadVolume(page);
      const scrubber = page.getByRole('slider', { name: /coronal slice/i }).first();
      const last = await scrubber.getAttribute('aria-valuemax');
      await scrubber.focus();
      await page.keyboard.press('Home');
      await expect(scrubber).toHaveAttribute('aria-valuenow', '1');
      await page.keyboard.press('End');
      await expect(scrubber).toHaveAttribute('aria-valuenow', String(last));
    });
  });
});
