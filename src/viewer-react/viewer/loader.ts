import {
  type ImportSource,
  type LoadResult,
  type SeriesChoice,
  describeLoadError,
  fetchBlobWithProgress,
  fromFileList,
  loadVolumeInWorker,
} from '@prisma-mri/viewer-core';
import { flushSync } from 'react-dom';
import type { ViewerStore } from './store';

/** Runs one load: the volume worker by default. */
export type VolumeLoadRunner = typeof loadVolumeInWorker;

export type VolumeLoadedListener = (result: LoadResult) => void;

export interface ViewerLoaderOptions {
  /** Replaces the volume worker — for tests, or a host that parses elsewhere. */
  runLoad?: VolumeLoadRunner;
  /**
   * Per-axis cap, in voxels, on the 3-D texture (default 512). Lower it for
   * weak GPUs; the slice panels always use the full-resolution volume.
   */
  maxTextureEdge?: number;
}

export interface ViewerLoader {
  /**
   * Opens a source. A new load aborts the one in flight. A source holding
   * several series sets `pendingSeries` and waits for `resolveSeries`.
   */
  load: (source: ImportSource, seriesKey?: string) => Promise<void>;
  /** Fetches a file by URL, with progress, then loads it. */
  loadUrl: (url: string, filename: string) => Promise<void>;
  /** Dismisses the series choice if one is open, otherwise aborts the load. */
  cancel: () => void;
  /** Re-assembles another series of the current source in place. */
  switchSeries: (key: string) => void;
  /** Answers the series choice: a series key, or null to cancel the load. */
  resolveSeries: (key: string | null) => void;
  /**
   * Called after each volume lands in the store, inside the same synchronous
   * React commit — so a host can swap routes without a frame in between.
   * Returns the unsubscribe function.
   */
  onVolumeLoaded: (listener: VolumeLoadedListener) => () => void;
}

const IDLE_LOADING = { active: false, percent: 0, stage: 'idle' as const, message: '' };

export const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

/**
 * One load in flight at a time (a new one aborts the old), the series-choice
 * round-trip for multi-series sources, in-place series switching and loading
 * by URL — all reported through the viewer's store.
 */
export function createViewerLoader(
  store: ViewerStore,
  { runLoad = loadVolumeInWorker, maxTextureEdge }: ViewerLoaderOptions = {},
): ViewerLoader {
  if (maxTextureEdge !== undefined && !(Number.isInteger(maxTextureEdge) && maxTextureEdge > 0)) {
    throw new Error(`maxTextureEdge must be a positive integer, not ${maxTextureEdge}.`);
  }
  let abort: AbortController | null = null;
  let resolveChoice: ((key: string | null) => void) | null = null;
  const listeners = new Set<VolumeLoadedListener>();

  const setLoading = (s: Parameters<ReturnType<ViewerStore['getState']>['setLoading']>[0]) =>
    store.getState().setLoading(s);

  /** Cancels any load in flight and arms a fresh abort controller. */
  function beginLoad(message: string): AbortController {
    abort?.abort();
    const controller = new AbortController();
    abort = controller;
    store.getState().setError(null);
    setLoading({ active: true, percent: 0, stage: 'scanning', message });
    return controller;
  }

  function failLoad(err: unknown, fallbackMessage: string): void {
    if (isAbort(err)) {
      setLoading(IDLE_LOADING);
      return;
    }
    const message = describeLoadError(err, fallbackMessage);
    store.getState().setError(message);
    setLoading({ ...IDLE_LOADING, stage: 'error', message });
  }

  /** Suspends the load while the user picks a series; null means they cancelled. */
  async function askForSeries(series: SeriesChoice[]): Promise<string | null> {
    const chosen = await new Promise<string | null>((resolve) => {
      resolveChoice = resolve;
      store.setState({ pendingSeries: series });
    });
    resolveChoice = null;
    store.setState({ pendingSeries: null });
    return chosen;
  }

  async function loadSource(
    source: ImportSource,
    seriesKey?: string,
    // Threaded through the choice round-trip so the stage switcher can offer
    // the other series after the chosen one loads.
    seriesList?: SeriesChoice[],
  ): Promise<void> {
    const controller = beginLoad('Reading…');
    try {
      const out = await runLoad(
        source,
        (p, percent) => {
          setLoading({
            active: true,
            percent,
            stage: p.stage,
            current: p.current,
            total: p.total,
            message: p.message,
          });
        },
        controller.signal,
        seriesKey,
        { maxTextureEdge },
      );

      if (out.kind === 'series-choice') {
        abort = null;
        setLoading(IDLE_LOADING);
        const chosen = await askForSeries(out.series);
        if (chosen === null) return;
        await loadSource(out.source, chosen, out.series);
        return;
      }

      const { result } = out;
      const { volume, prepared3D, histogram } = result;
      // Synchronous, listeners included, so a host that swaps screens on load
      // (PrismaMRI's import → viewer route) does it in the same commit.
      // `loading.active` deliberately stays true: the host clears it once its
      // viewer screen has mounted, so the old screen never flashes back.
      flushSync(() => {
        store.getState().setVolume(volume, prepared3D, histogram);
        for (const listener of listeners) listener(result);
      });

      if (seriesList && seriesList.length > 1) {
        store.getState().setSeriesContext(source, seriesList, seriesKey ?? null);
      } else {
        store.getState().clearSeriesContext();
      }
    } catch (err) {
      failLoad(err, 'Failed to load volume.');
    } finally {
      if (abort === controller) abort = null;
    }
  }

  return {
    load: (source, seriesKey) => loadSource(source, seriesKey),

    async loadUrl(url, filename) {
      const controller = beginLoad('Fetching…');
      try {
        const blob = await fetchBlobWithProgress(
          url,
          (loaded, total) => {
            const percent = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
            setLoading({ active: true, percent, stage: 'scanning', message: 'Fetching…' });
          },
          controller.signal,
        );
        void loadSource(fromFileList([new File([blob], filename)]));
      } catch (err) {
        failLoad(err, 'Failed to fetch example.');
      } finally {
        if (abort === controller) abort = null;
      }
    },

    cancel() {
      if (resolveChoice) {
        resolveChoice(null);
        return;
      }
      abort?.abort();
      abort = null;
    },

    switchSeries(key) {
      const { seriesSource, seriesList, activeSeriesKey } = store.getState();
      if (!seriesSource || !seriesList || key === activeSeriesKey) return;
      void loadSource(seriesSource, key, seriesList);
    },

    resolveSeries(key) {
      resolveChoice?.(key);
    },

    onVolumeLoaded(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
