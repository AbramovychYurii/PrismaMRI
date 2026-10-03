import { PLANE_LABEL } from '@/constants';
import type { SlicePanelCore } from '@/hooks/useSlicePanelCore';
import { type ScreenDirection, stepInPlane } from '@/lib/volume/plane';
import type { SlicePlane } from '@/types';
import { useCallback, useRef } from 'react';

const ARROWS: Record<string, ScreenDirection> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

const SHORTCUTS =
  'ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+F10 ContextMenu';

/**
 * How long after a keyboard open the native contextmenu event is ignored.
 * Shift+F10 and the Menu key also fire one on Windows / Linux, after the
 * keydown — it would reopen the menu at a pointer position, not the crosshair.
 */
const NATIVE_MENU_GRACE_MS = 600;

/**
 * Keyboard access to a slice panel — what a pointer does with clicks and the
 * context menu. Spread onto the panel's own container (rail or fullscreen):
 *
 *  - tabbing to the panel makes its plane the active one, so ↑ / ↓ step it;
 *  - Shift + arrows move the crosshair one voxel in the plane, as drawn;
 *  - Shift+F10 or the context-menu key opens the measure menu at the crosshair;
 *  - it also takes over the panel's contextmenu, so a right-click still opens
 *    the menu at the pointer but a keyboard open is not followed by a second.
 *
 * Keys pressed on a control inside the panel (scrubber, buttons) are theirs.
 */
export function useSlicePanelKeys(core: SlicePanelCore, plane: SlicePlane) {
  const { setActivePlane, setCursor, cross } = core;
  const { dims, cursor } = core.frame;
  const { openMenuAtCursor, onContextMenu: openMenuAtPointer } = core.measure;
  const openedByKeyAt = useRef(Number.NEGATIVE_INFINITY);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;

      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        openedByKeyAt.current = performance.now();
        const rect = e.currentTarget.getBoundingClientRect();
        const fx = cross?.fx ?? 0.5;
        const fy = cross?.fy ?? 0.5;
        openMenuAtCursor(rect.left + fx * rect.width, rect.top + fy * rect.height);
        return;
      }

      const direction = ARROWS[e.key];
      if (!e.shiftKey || !direction || !dims || !cursor) return;
      e.preventDefault();
      setCursor(stepInPlane(plane, cursor, dims, direction));
    },
    [cross, cursor, dims, openMenuAtCursor, plane, setCursor],
  );

  // Keyboard focus only: a click focuses the panel too, on mousedown, and
  // activating the plane there would turn the click that is meant to select
  // the panel into one that also moves its crosshair.
  const onFocus = useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      if (e.target === e.currentTarget && e.currentTarget.matches(':focus-visible')) {
        setActivePlane(plane);
      }
    },
    [plane, setActivePlane],
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (performance.now() - openedByKeyAt.current < NATIVE_MENU_GRACE_MS) {
        e.preventDefault();
        return;
      }
      openMenuAtPointer(e);
    },
    [openMenuAtPointer],
  );

  return {
    tabIndex: 0,
    role: 'group',
    'aria-label': `${PLANE_LABEL[plane].primary} slice — up and down arrows step through slices, Shift and arrow keys move the crosshair, Shift+F10 opens the measure menu`,
    'aria-keyshortcuts': SHORTCUTS,
    onKeyDown,
    onFocus,
    onContextMenu,
  } as const;
}
