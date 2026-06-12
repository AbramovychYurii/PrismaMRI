import { useActivePlaneKeys, usePlaneFocusKeys } from '@/hooks/useSliceScroll';
import { useWindowLevel } from '@/hooks/useWindowLevel';
import { fetchBlobWithProgress } from '@/lib/fetch-with-progress';
import { fromDirectoryHandle, fromFileList } from '@/lib/import/scan-folder';
import type { ImportSource } from '@/lib/import/types';
import { loadVolumeInWorker } from '@/lib/import/volume-client';
import * as volumeDb from '@/lib/volumeDb';
import { useVolumeStore } from '@/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';

interface DirPickerWindow {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

/**
 * Top-level app glue: worker-backed loading, file/folder pickers, and the
 * global keyboard shortcuts. Also installs the debounced W/L commit and
 * active-plane arrow stepping.
 */
export function useViewerApp() {
  const setLoading = useVolumeStore((s) => s.setLoading);
  const setError = useVolumeStore((s) => s.setError);
  const setVolume = useVolumeStore((s) => s.setVolume);
  const navigate = useNavigate();

  useWindowLevel();
  useActivePlaneKeys();
  usePlaneFocusKeys();

  const abortRef = useRef<AbortController | null>(null);

  const loadFromSource = useCallback(
    async (source: ImportSource) => {
      // Cancel any in-progress load before starting a new one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setLoading({
        active: true,
        percent: 0,
        stage: 'scanning',
        message: 'Reading…',
      });
      try {
        const { volume, prepared3D, histogram } = await loadVolumeInWorker(
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
        );
        // Commit setVolume + the route change synchronously so ImportOverlay
        // starts unmounting before any further work. We deliberately do NOT
        // clear loading.active here: the route swap doesn't guarantee the
        // example cards have actually left the DOM (the heavy AppGrid mount
        // can hold the previous frame on screen), so flipping it to false
        // mid-transition would briefly un-dim the cards. ViewerPage clears
        // it from a mount effect — guaranteed to fire only after the viewer
        // has taken over.
        flushSync(() => {
          setVolume(volume, prepared3D, histogram);
          navigate('/viewer');
        });
        // Save to IndexedDB in the background — don't block the UI.
        volumeDb.saveVolume(volume, prepared3D, histogram).catch(() => {
          // Non-critical: storage might be full or unavailable.
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setLoading({ active: false, percent: 0, stage: 'idle', message: '' });
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to load volume.';
        setError(message);
        setLoading({ active: false, percent: 0, stage: 'error', message });
      } finally {
        abortRef.current = null;
      }
    },
    [setError, setLoading, setVolume, navigate],
  );

  const cancelLoad = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const openFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      void loadFromSource(fromFileList(arr));
    },
    [loadFromSource],
  );

  const openFolder = useCallback(async () => {
    const w = window as unknown as DirPickerWindow;
    if (w.showDirectoryPicker) {
      try {
        const handle = await w.showDirectoryPicker();
        const source = await fromDirectoryHandle(handle);
        await loadFromSource(source);
      } catch (err) {
        if ((err as DOMException)?.name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Folder pick failed.');
        }
      }
      return;
    }
    // Fallback: hidden webkitdirectory input
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.onchange = () => {
      if (input.files) openFiles(input.files);
    };
    input.click();
  }, [loadFromSource, openFiles, setError]);

  const openFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dcm,.nii,.gz,.nrrd,.nhdr,.mha,.mhd,.zip';
    input.multiple = true;
    input.onchange = () => {
      if (input.files) openFiles(input.files);
    };
    input.click();
  }, [openFiles]);

  const loadFromUrl = useCallback(
    async (url: string, filename: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setLoading({ active: true, percent: 0, stage: 'scanning', message: 'Fetching…' });
      try {
        const blob = await fetchBlobWithProgress(
          url,
          (loaded, total) => {
            const percent = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
            setLoading({ active: true, percent, stage: 'scanning', message: 'Fetching…' });
          },
          controller.signal,
        );
        const file = new File([blob], filename);
        openFiles([file]);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setLoading({ active: false, percent: 0, stage: 'idle', message: '' });
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to fetch example.';
        setError(message);
        setLoading({ active: false, percent: 0, stage: 'error', message });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [openFiles, setError, setLoading],
  );

  const [showShortcuts, setShowShortcuts] = useState(false);

  // Global shortcuts: Esc → close shortcuts modal only, ⌘/Ctrl+O → open
  // folder, ? → toggle shortcuts.  Esc no longer navigates back to the import
  // screen — that's now strictly a click on the "Back to import" button so a
  // stray Esc can't dump the user out of a long-loaded volume.
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
    showShortcuts,
    setShowShortcuts,
  };
}
