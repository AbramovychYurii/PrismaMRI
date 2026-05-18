import { useActivePlaneKeys } from '@/hooks/useSliceScroll';
import { useWindowLevel } from '@/hooks/useWindowLevel';
import { fetchBlobWithProgress } from '@/lib/fetch-with-progress';
import { fromDirectoryHandle, fromFileList } from '@/lib/import/scan-folder';
import type { ImportSource } from '@/lib/import/types';
import { loadVolumeInWorker } from '@/lib/import/volume-client';
import { useVolumeStore } from '@/store';
import { useCallback, useEffect } from 'react';

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
  const setView = useVolumeStore((s) => s.setView);

  useWindowLevel();
  useActivePlaneKeys();

  const loadFromSource = useCallback(
    async (source: ImportSource) => {
      setError(null);
      setLoading({
        active: true,
        percent: 0,
        stage: 'scanning',
        message: 'Reading…',
      });
      try {
        const { volume, prepared3D } = await loadVolumeInWorker(source, (p, percent) => {
          setLoading({
            active: true,
            percent,
            stage: p.stage,
            current: p.current,
            total: p.total,
            message: p.message,
          });
        });
        setVolume(volume, prepared3D);
        setLoading({
          active: false,
          percent: 100,
          stage: 'done',
          message: 'Ready',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load volume.';
        setError(message);
        setLoading({ active: false, percent: 0, stage: 'error', message });
      }
    },
    [setError, setLoading, setVolume],
  );

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
      setError(null);
      // setLoading({
      //   active: true,
      //   percent: 0,
      //   stage: "scanning",
      //   message: "Fetching…",
      // });
      try {
        const blob = await fetchBlobWithProgress(url, (loaded, total) => {
          const percent = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
          setLoading({
            active: true,
            percent,
            stage: 'scanning',
            message: 'Fetching…',
          });
        });
        const file = new File([blob], filename);
        openFiles([file]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch example.';
        setError(message);
        setLoading({ active: false, percent: 0, stage: 'error', message });
      }
    },
    [openFiles, setError, setLoading],
  );

  // Global shortcuts: Esc → import, ⌘/Ctrl+O → open folder
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setView('import');
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void openFolder();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openFolder, setView]);

  return { loadFromSource, openFiles, openFolder, openFile, loadFromUrl };
}
