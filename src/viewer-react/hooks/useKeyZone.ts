import { useEffect } from 'react';
import type { ViewerFeatures, ViewerLayout, ViewerStoreState } from '../viewer';

/**
 * ↑/↓ mean two things in the viewer: pitch the 3-D volume (view controls) and
 * step the active slice. They go to whichever part the user is in — the stage
 * or the slice panels — judged by where the pointer or focus last was.
 *
 * Parts mark themselves with `data-key-zone="stage" | "slices"`; the latest
 * one entered is kept on the viewer's root as `data-key-zone`.
 */
export type KeyZone = 'stage' | 'slices';

const ZONE_ATTR = 'keyZone';

/** Follows the pointer and focus between the stage and the slice panels. */
export function useKeyZoneTracking(root: HTMLElement | null): void {
  useEffect(() => {
    if (!root) return;
    const note = (e: Event) => {
      const part = e.target instanceof Element ? e.target.closest('[data-key-zone]') : null;
      const zone = part?.getAttribute('data-key-zone');
      if (zone === 'stage' || zone === 'slices') root.dataset[ZONE_ATTR] = zone;
    };
    root.addEventListener('pointerover', note);
    root.addEventListener('pointerdown', note);
    root.addEventListener('focusin', note);
    return () => {
      root.removeEventListener('pointerover', note);
      root.removeEventListener('pointerdown', note);
      root.removeEventListener('focusin', note);
    };
  }, [root]);
}

/**
 * Whether ↑/↓ belong to the 3-D stage right now. With no slice panel on screen
 * they always do; with both on screen, the last one the user was in wins, and
 * until they have been in either, the slices keep them as before.
 */
export function arrowsGoToStage(
  root: HTMLElement | null,
  layout: ViewerLayout,
  state: Pick<ViewerStoreState, 'mobileTab' | 'toolbar'>,
  features: Pick<ViewerFeatures, 'rail'>,
): boolean {
  if (layout === 'mobile') return state.mobileTab === '3d';
  if (!features.rail || !state.toolbar.rail || state.toolbar.focus) return true;
  return root?.dataset[ZONE_ATTR] === 'stage';
}
