import { type RefObject, useEffect } from 'react';

const ITEM_SELECTOR = '[role="menuitem"]:not([disabled])';

/**
 * Keyboard model of a popup menu (the WAI-ARIA menu pattern), for a container
 * with role="menu" whose items carry role="menuitem":
 *
 *  - focus moves to the first item when the menu opens;
 *  - ↑ / ↓ move through the items and wrap, Home / End jump to the ends;
 *  - Esc closes it without reaching document-level Esc handlers (which would
 *    also close whatever the menu sits in), Tab closes it;
 *  - focus goes back to where it was when the menu opened.
 *
 * `onClose` must be stable — an inline arrow re-runs the effect every render.
 */
export function useMenuKeyboard(
  menuRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  open = true,
): void {
  useEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
    items()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      const list = items();
      if (list.length === 0) return;
      const index = list.indexOf(document.activeElement as HTMLElement);
      const focusAt = (i: number) => list[(i + list.length) % list.length]?.focus();
      // The menu's own keys stop here: window-level handlers (↑/↓ slice
      // stepping) must not act on them too.
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) e.stopPropagation();
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          focusAt(index + 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          focusAt(index < 0 ? -1 : index - 1);
          break;
        case 'Home':
          e.preventDefault();
          focusAt(0);
          break;
        case 'End':
          e.preventDefault();
          focusAt(-1);
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
        case 'Tab':
          onClose();
          break;
      }
    };
    menu.addEventListener('keydown', onKeyDown);

    return () => {
      menu.removeEventListener('keydown', onKeyDown);
      // Hand focus back only if it is still inside the menu or was dropped with
      // it — never pull it away from something the user has since moved to.
      const active = document.activeElement;
      if (opener?.isConnected && (active === document.body || menu.contains(active))) {
        opener.focus();
      }
    };
  }, [menuRef, onClose, open]);
}
