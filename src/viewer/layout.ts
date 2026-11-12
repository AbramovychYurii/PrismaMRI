import type { ViewerLayout } from '@/viewer/context';
import { useLayoutEffect, useState } from 'react';

/** Below this container width the viewer switches to the tabbed layout. */
export const MOBILE_MAX_WIDTH = 767;

/** `auto` follows the container's width; the others pin the layout. */
export type ViewerLayoutMode = 'auto' | ViewerLayout;

function layoutForWidth(width: number): ViewerLayout {
  return width <= MOBILE_MAX_WIDTH ? 'mobile' : 'desktop';
}

/**
 * The layout for a viewer drawn in `element`: pinned by `mode`, or picked from
 * the element's own width — not the window's, so a viewer in a narrow column
 * of a wide page gets the tabs. Null until the element is measured.
 */
export function useContainerLayout(
  element: HTMLElement | null,
  mode: ViewerLayoutMode,
): ViewerLayout | null {
  const [measured, setMeasured] = useState<ViewerLayout | null>(null);

  // Layout effect: the first measurement lands before paint, so the viewer
  // never flashes the wrong arrangement.
  useLayoutEffect(() => {
    if (mode !== 'auto' || !element) return;
    setMeasured(layoutForWidth(element.getBoundingClientRect().width));
    const ro = new ResizeObserver(([entry]) => {
      setMeasured(layoutForWidth(entry.contentRect.width));
    });
    ro.observe(element);
    return () => ro.disconnect();
  }, [element, mode]);

  return mode === 'auto' ? measured : mode;
}
