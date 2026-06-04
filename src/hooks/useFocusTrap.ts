/**
 * useFocusTrap — keep keyboard focus inside a container element.
 *
 * Pair with a `ref` attached to the dialog's outer node.  While the trap is
 * active, pressing Tab from the last focusable element cycles back to the
 * first, and Shift+Tab from the first cycles to the last.  Any keyboard
 * focus movement outside the container is intercepted.
 *
 * The hook also remembers the previously focused element and restores it
 * when the trap deactivates — important so closing a modal returns focus to
 * the trigger button rather than dumping it on <body>.
 *
 * Pure DOM — no React state, no styled-components, safe to call from any
 * portal'd component.
 */

import { type RefObject, useEffect } from 'react';

/**
 * Selector for elements that are reachable via Tab in standard browsers.
 * Filtered further at runtime to exclude `disabled`, hidden, and visually
 * collapsed elements that browsers still expose as focusable nodes.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

function isVisible(el: HTMLElement): boolean {
  // `offsetParent` is null for `display: none` ancestors and for the page
  // <html>/<body>. For dialogs we never trap at the root, so this catches
  // the practical "hidden" cases without a layout read of the full tree.
  if (el.offsetParent === null && el.tagName !== 'BODY') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

/**
 * Trap focus inside `containerRef.current` while `active` is true.
 *
 * @param containerRef Ref to the dialog's outermost focusable boundary.
 * @param active       Toggle the trap (mount/unmount semantics).
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Remember and later restore the previously focused element so closing
    // the modal returns focus to whichever button opened it.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      if (!container) return;

      const focusable = getFocusable(container);
      if (focusable.length === 0) {
        // No tabbable element inside — pin focus to the container itself.
        e.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        // Shift+Tab from first (or anywhere outside the container) → last.
        if (current === first || !container.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab from last (or anywhere outside the container) → first.
        if (current === last || !container.contains(current)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    // Defensive: if focus ever escapes (programmatic .focus() outside the
    // container, browser quirk), pull it back to the first focusable element.
    function onFocusIn(e: FocusEvent) {
      if (!container) return;
      const target = e.target as HTMLElement | null;
      if (target && !container.contains(target)) {
        const focusable = getFocusable(container);
        (focusable[0] ?? container).focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      // Restore focus to the element that owned it before the trap engaged
      // — but only if it's still in the document.
      if (previouslyFocused && document.body.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef]);
}
