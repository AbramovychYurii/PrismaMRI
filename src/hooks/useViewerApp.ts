import { isAbort, useVolumeLoader } from '@/hooks/useVolumeLoader';
import { type DirPickerWindow, IMPORT_ACCEPT, pickFiles } from '@/lib/file-pickers';
import { fromDirectoryHandle, fromFileList } from '@/lib/import/scan-folder';
import { useVolumeStore } from '@/store';
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Top-level app glue: worker-backed loading, file/folder pickers, and the
 * global keyboard shortcuts.
 *
 * Its result is the ViewerActions context value, so it must not subscribe to
 * anything that changes while the user works — a W/L drag or plane change here
 * would re-render every consumer, ViewerPage and with it the whole viewer.
 * Store-driven effects live in `useViewerStoreEffects` instead.
 */
export function useViewerApp() {
  const setError = useVolumeStore((s) => s.setError);
  const {
    loadFromSource,
    loadFromUrl,
    cancelLoad,
    pendingSeries,
    resolveSeriesChoice,
    switchSeries,
  } = useVolumeLoader();

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
    pickFiles({ accept: IMPORT_ACCEPT }, openFiles);
  }, [openFiles]);

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

  return useMemo(
    () => ({
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
    }),
    [
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
    ],
  );
}
