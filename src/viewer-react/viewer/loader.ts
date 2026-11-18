import {
  type ImportHints,
  type ImportSource,
  type LoadResult,
  type SeriesChoice,
  describeLoadError,
  fromFileList,
  loadVolumeInWorker,
} from '@prisma-mri/viewer-core';
import { fetchBlobWithProgress } from '@prisma-mri/viewer-core/unstable';
import { flushSync } from 'react-dom';
import { type ViewerSeriesContext, type ViewerStore, seriesContextOf } from './store';

/** Runs one load: the volume worker by default. */
export type VolumeLoadRunner = typeof loadVolumeInWorker;

/**
 * `series` is the study the volume belongs to when it has several series, else
 * null — what a host that caches the volume keeps to restore the selector.
 */
export type VolumeLoadedListener = (result: LoadResult, series: ViewerSeriesContext | null) => void;

export interface ViewerLoaderOptions {
  /** Replaces the volume worker — for tests, or a host that parses elsewhere. */
  runLoad?: VolumeLoadRunner;
  /**
   * Per-axis cap, in voxels, on the 3-D texture (default 512). Lower it for
   * weak GPUs; the slice panels always use the full-resolution volume.
   */
  maxTextureEdge?: number;
  /**
   * Keeps `loading.active` on after a volume lands, until the host calls
   * `finishLoading()`. For a host that swaps screens on load (an import screen
   * → the viewer) and must not show the old screen un-dimmed while the new one
   * mounts. Off by default: a load ends on its own, in the commit that shows
   * the volume.
   */
  holdLoading?: boolean;
}

export interface ViewerLoader {
  /**
   * Opens a source. A new load aborts the one in flight. A source holding
   * several series sets `pendingSeries` and waits for `resolveSeries`.
   */
  load: (source: ImportSource, seriesKey?: string) => Promise<void>;
  /** Fetches a file by URL, with progress, then loads it. */
  loadUrl: (url: string, filename: string, hints?: ImportHints) => Promise<void>;
  /** Dismisses the series choice if one is open, otherwise aborts the load. */
  cancel: () => void;
  /**
   * Re-assembles another series of the current source in place. Resolves when
   * it is on screen — or at once if there is nothing to switch. A failed load
   * resolves too, with `error` set; check `activeSeriesKey` to know.
   */
  switchSeries: (key: string) => Promise<void>;
  /** Answers the series choice: a series key, or null to cancel the load. */
  resolveSeries: (key: string | null) => void;
  /**
   * Called after each volume lands in the store, inside the same synchronous
   * React commit — so a host can swap routes without a frame in between.
   * Returns the unsubscribe function.
   */
  onVolumeLoaded: (listener: VolumeLoadedListener) => () => void;
  /**
   * Aborts the load in flight, dismisses an open series choice and drops every
   * `onVolumeLoaded` listener. Safe to call twice; the loader stays usable.
   */
  dispose: () => void;
}

const IDLE_LOADING = { active: false, percent: 0, stage: 'idle' as const, message: '' };

/** Where a load that landed leaves `loading` — on its own, or through `finishLoading()`. */
export const DONE_LOADING = {
  active: false,
  percent: 100,
  stage: 'done' as const,
  message: 'Ready',
};

export const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

/**
 * One load in flight at a time (a new one aborts the old), the series-choice
 * round-trip for multi-series sources, in-place series switching and loading
 * by URL — all reported through the viewer's store.
 */
export function createViewerLoader(
  store: ViewerStore,
  { runLoad = loadVolumeInWorker, maxTextureEdge, holdLoading = false }: ViewerLoaderOptions = {},
): ViewerLoader {
  if (maxTextureEdge !== undefined && !(Number.isInteger(maxTextureEdge) && maxTextureEdge > 0)) {
    throw new Error(`maxTextureEdge must be a positive integer, not ${maxTextureEdge}.`);
  }
  let abort: AbortController | null = null;
  /** Counts series switches, so the one that ends last is the one that clears the flag. */
  let switchSeq = 0;
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

      // A runner that ignores the abort signal must not land its volume after
      // the load was cancelled or the viewer disposed.
      if (controller.signal.aborted) {
        setLoading(IDLE_LOADING);
        return;
      }

      const { result } = out;
      const { volume, prepared3D, histogram } = result;
      // Synchronous, listeners included, so a host that swaps screens on load
      // (an import → viewer route) does it in the same commit. With
      // `holdLoading`, `loading.active` stays true until the host's
      // `finishLoading()`, so its old screen never flashes back un-dimmed.
      flushSync(() => {
        const { setVolume, setSeriesContext, clearSeriesContext } = store.getState();
        setVolume(volume, prepared3D, histogram);
        if (!holdLoading) setLoading(DONE_LOADING);
        // In the same commit as the volume, so no render shows the new volume
        // beside the findings of the old series.
        if (seriesList && seriesList.length > 1) {
          setSeriesContext({
            source,
            list: seriesList,
            activeKey: seriesKey ?? null,
            volumeIds: {},
          });
        } else {
          clearSeriesContext();
        }
        const series = seriesContextOf(store.getState());
        for (const listener of listeners) listener(result, series);
      });
    } catch (err) {
      failLoad(err, 'Failed to load volume.');
    } finally {
      if (abort === controller) abort = null;
    }
  }

  function cancel(): void {
    if (resolveChoice) {
      resolveChoice(null);
      return;
    }
    abort?.abort();
    abort = null;
  }

  return {
    load: (source, seriesKey) => loadSource(source, seriesKey),

    async loadUrl(url, filename, hints) {
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
        void loadSource({ ...fromFileList([new File([blob], filename)]), hints });
      } catch (err) {
        failLoad(err, 'Failed to fetch example.');
      } finally {
        if (abort === controller) abort = null;
      }
    },

    cancel,

    switchSeries(key) {
      const { seriesSource, seriesList, activeSeriesKey } = store.getState();
      if (!seriesSource || !seriesList || key === activeSeriesKey) return Promise.resolve();
      store.getState().setSwitchingSeries(key);
      const mine = ++switchSeq;
      return loadSource(seriesSource, key, seriesList).finally(() => {
        // A newer switch aborts this one and clears the flag itself when it ends.
        if (switchSeq === mine) store.getState().setSwitchingSeries(null);
      });
    },

    resolveSeries(key) {
      resolveChoice?.(key);
    },

    dispose() {
      cancel();
      listeners.clear();
    },

    onVolumeLoaded(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
