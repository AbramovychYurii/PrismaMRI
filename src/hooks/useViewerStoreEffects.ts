import { useActivePlaneKeys, usePlaneFocusKeys } from '@/hooks/useSliceScroll';
import { useWindowLevel } from '@/hooks/useWindowLevel';

/**
 * App-wide effects that follow the store: the debounced W/L commit and the
 * plane keys (↑/↓ step, 1/2/3 focus). Mounted once from a component of their
 * own so the re-renders their subscriptions cause stay in that component.
 */
export function useViewerStoreEffects(): void {
  useWindowLevel();
  useActivePlaneKeys();
  usePlaneFocusKeys();
}
