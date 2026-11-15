import { useSeriesKeys } from './useSeriesKeys';
import { useActivePlaneKeys, usePlaneFocusKeys } from './useSliceScroll';
import { useWindowLevel } from './useWindowLevel';

/**
 * App-wide effects that follow the store: the debounced W/L commit, the
 * plane keys (↑/↓ step, 1/2/3 focus) and the series keys ([ and ]). Mounted
 * once from a component of their own so the re-renders their subscriptions
 * cause stay in that component.
 */
export function useViewerStoreEffects(): void {
  useWindowLevel();
  useActivePlaneKeys();
  usePlaneFocusKeys();
  useSeriesKeys();
}
