import { useEffect } from 'react';
import { useViewer, useViewerEnvironment, useViewerFeatures, useViewerStoreApi } from '../viewer';
import { isTextEntry, listenForKeys } from './useSliceScroll';

/**
 * [ and ] open the previous and next series of a multi-series study, from
 * anywhere in the viewer. Presses are counted from the series being switched
 * to, not the one still on screen, so two quick presses go two series on. The
 * ends of the list do not wrap: a series list is an order, not a ring.
 */
export function useSeriesKeys(): void {
  const store = useViewerStoreApi();
  const viewer = useViewer();
  const { keyboardTarget } = useViewerEnvironment();
  const { seriesSelect } = useViewerFeatures();

  useEffect(() => {
    if (!keyboardTarget || !seriesSelect) return;
    const onKey = (e: KeyboardEvent) => {
      // `code` for a layout whose brackets sit on other characters (Ukrainian);
      // `key` for input that sends no `code` (a virtual keyboard, a remote session).
      const forward = e.code === 'BracketRight' || e.key === ']';
      const back = e.code === 'BracketLeft' || e.key === '[';
      const step = forward ? 1 : back ? -1 : 0;
      if (step === 0) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || isTextEntry(e)) return;

      const { seriesList, activeSeriesKey, switchingSeriesKey } = store.getState();
      if (!seriesList || seriesList.length < 2) return;
      const from = seriesList.findIndex((s) => s.key === (switchingSeriesKey ?? activeSeriesKey));
      const next = seriesList[from + step];
      if (from < 0 || !next) return;
      e.preventDefault();
      void viewer.switchSeries(next.key);
    };
    return listenForKeys(keyboardTarget, onKey);
  }, [store, viewer, keyboardTarget, seriesSelect]);
}
