import { useActivePlaneKeys, usePlaneFocusKeys } from '@/hooks/useSliceScroll';
import { useWindowLevel } from '@/hooks/useWindowLevel';
import { fetchBlobWithProgress } from '@/lib/fetch-with-progress';
import { fromDirectoryHandle, fromFileList } from '@/lib/import/scan-folder';
import type { ImportSource, SeriesChoice } from '@/lib/import/types';
import { loadVolumeInWorker } from '@/lib/import/volume-client';
import * as volumeDb from '@/lib/volumeDb';
import { useVolumeStore } from '@/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';

interface DirPickerWindow {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

const IDLE_LOADING = { active: false, percent: 0, stage: 'idle' as const, message: '' };

function pickFiles(
  options: { accept?: string; directory?: boolean },
  onPick: (files: FileList) => void,
): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  if (options.accept) input.accept = options.accept;
  if (options.directory) input.webkitdirectory = true;
  input.onchange = () => {
    if (input.files) onPick(input.files);
  };
  input.click();
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

/**
 * Top-level app glue: worker-backed loading, file/folder pickers, and the
 * global keyboard shortcuts. Also installs the debounced W/L commit and
 * active-plane arrow stepping.
 */
export function useViewerApp() {
  const setLoading = useVolumeStore((s) => s.setLoading);
  const setError = useVolumeStore((s) => s.setError);
  const setVolume = useVolumeStore((s) => s.setVolume);
  const setSeriesContext = useVolumeStore((s) => s.setSeriesContext);
  const clearSeriesContext = useVolumeStore((s) => s.clearSeriesContext);
  const navigate = useNavigate();

  useWindowLevel();
  useActivePlaneKeys();
  usePlaneFocusKeys();

  const abortRef = useRef<AbortController | null>(null);

  /** Series list shown by the picker, plus the resolver its buttons call. */
  const [pendingSeries, setPendingSeries] = useState<SeriesChoice[] | null>(null);
  const seriesResolveRef = useRef<((key: string | null) => void) | null>(null);

  /** Cancels any load in flight and arms a fresh abort controller. */
  const beginLoad = useCallback(
    (message: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      setLoading({ active: true, percent: 0, stage: 'scanning', message });
      return controller;
    },
    [setError, setLoading],
  );

  const failLoad = useCallback(
    (err: unknown, fallbackMessage: string) => {
      if (isAbort(err)) {
        setLoading(IDLE_LOADING);
        return;
      }
      const message = err instanceof Error ? err.message : fallbackMessage;
      setError(message);
      setLoading({ ...IDLE_LOADING, stage: 'error', message });
    },
    [setError, setLoading],
  );

  /** Suspends the load while the user picks a series; null means they cancelled. */
  const askForSeries = useCallback(async (series: SeriesChoice[]) => {
    const chosen = await new Promise<string | null>((resolve) => {
      seriesResolveRef.current = resolve;
      setPendingSeries(series);
    });
    seriesResolveRef.current = null;
    setPendingSeries(null);
    return chosen;
  }, []);

  const loadFromSource = useCallback(
    async (
      source: ImportSource,
      seriesKey?: string,
      // Threaded through the picker round-trip so the stage switcher can offer
      // the other series after the chosen one loads.
      seriesList?: SeriesChoice[],
    ): Promise<void> => {
      const controller = beginLoad('Reading…');
      try {
        const out = await loadVolumeInWorker(
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
        );

        if (out.kind === 'series-choice') {
          abortRef.current = null;
          setLoading(IDLE_LOADING);
          const chosen = await askForSeries(out.series);
          if (chosen === null) return;
          await loadFromSource(source, chosen, out.series);
          return;
        }

        const { volume, prepared3D, histogram } = out.result;
        // Synchronous so ImportOverlay starts unmounting before anything else
        // runs. `loading.active` deliberately stays true: the route swap alone
        // doesn't guarantee the example cards have left the DOM, and clearing
        // it mid-transition would briefly un-dim them. ViewerPage clears it
        // from a mount effect instead.
        flushSync(() => {
          setVolume(volume, prepared3D, histogram);
          navigate('/viewer');
        });

        if (seriesList && seriesList.length > 1) {
          setSeriesContext(source, seriesList, seriesKey ?? null);
        } else {
          clearSeriesContext();
        }

        volumeDb.saveVolume(volume, prepared3D, histogram).catch(() => {
          /* storage full or unavailable — the volume still loaded */
        });
      } catch (err) {
        failLoad(err, 'Failed to load volume.');
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [
      beginLoad,
      failLoad,
      askForSeries,
      setLoading,
      setVolume,
      setSeriesContext,
      clearSeriesContext,
      navigate,
    ],
  );

  /** Resolve the open series picker with a chosen key, or null to cancel. */
  const resolveSeriesChoice = useCallback((key: string | null) => {
    seriesResolveRef.current?.(key);
  }, []);

  /**
   * Switch the displayed series in place (stage series-switcher). Re-assembles
   * the chosen series from the retained source; no-op if it's already active.
   */
  const switchSeries = useCallback(
    (key: string) => {
      const { seriesSource, seriesList, activeSeriesKey } = useVolumeStore.getState();
      if (!seriesSource || !seriesList || key === activeSeriesKey) return;
      void loadFromSource(seriesSource, key, seriesList);
    },
    [loadFromSource],
  );

  /** Cancels the series picker if it is open, otherwise aborts the worker. */
  const cancelLoad = useCallback(() => {
    if (seriesResolveRef.current) {
      seriesResolveRef.current(null);
      return;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const openFiles = useCallback(
    (files: FileList | File[]) => {
      const picked = Array.from(files);
      if (picked.length === 0) return;
      void loadFromSource(fromFileList(picked));
    },
    [loadFromSource],
  );

  const openFolder = useCallback(async () => {
    const picker = (window as unknown as DirPickerWindow).showDirectoryPicker;
    if (!picker) {
      pickFiles({ directory: true }, openFiles);
      return;
    }
    try {
      const handle = await picker();
      await loadFromSource(await fromDirectoryHandle(handle));
    } catch (err) {
      if (!isAbort(err)) {
        setError(err instanceof Error ? err.message : 'Folder pick failed.');
      }
    }
  }, [loadFromSource, openFiles, setError]);

  const openFile = useCallback(() => {
    pickFiles({ accept: '.dcm,.nii,.gz,.nrrd,.nhdr,.mha,.mhd,.zip' }, openFiles);
  }, [openFiles]);

  const loadFromUrl = useCallback(
    async (url: string, filename: string) => {
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
        openFiles([new File([blob], filename)]);
      } catch (err) {
        failLoad(err, 'Failed to fetch example.');
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [openFiles, beginLoad, failLoad, setLoading],
  );

  const [showShortcuts, setShowShortcuts] = useState(false);

  // Esc only closes the shortcuts modal — never navigates back to import, so a
  // stray press can't dump the user out of a long-loaded volume.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '?') {
        setShowShortcuts((v) => !v);
      } else if (e.key === 'Escape') {
        setShowShortcuts((v) => (v ? false : v));
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void openFolder();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openFolder]);

  return {
    loadFromSource,
    openFiles,
    openFolder,
    openFile,
    loadFromUrl,
    cancelLoad,
    pendingSeries,
    resolveSeriesChoice,
    switchSeries,
    showShortcuts,
    setShowShortcuts,
  };
}
