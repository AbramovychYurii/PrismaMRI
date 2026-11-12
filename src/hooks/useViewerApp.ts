import { type DirPickerWindow, IMPORT_ACCEPT, pickFiles } from '@/lib/file-pickers';
import * as volumeDb from '@/lib/volumeDb';
import { fromDirectoryHandle, fromFileList } from '@prisma-mri/viewer-core';
import { isAbort, useViewer, useViewerStore } from '@prisma-mri/viewer-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Top-level app glue: what the app does once a volume loads (show the viewer
 * route, cache the volume for reloads), the file/folder pickers, and the
 * global keyboard shortcuts. Loading itself belongs to the viewer.
 *
 * Its result is the ViewerActions context value, so it must not subscribe to
 * anything that changes while the user works — a W/L drag or plane change here
 * would re-render every consumer, ViewerPage and with it the whole viewer.
 * Store-driven effects live in `useViewerStoreEffects` instead.
 */
export function useViewerApp() {
  const viewer = useViewer();
  const setError = useViewerStore((s) => s.setError);
  const navigate = useNavigate();

  // Runs inside the viewer's load commit, so the import screen starts
  // unmounting in the same frame the volume lands.
  useEffect(
    () =>
      viewer.onVolumeLoaded(({ volume, prepared3D, histogram }) => {
        navigate('/viewer');
        volumeDb
          .saveVolume(volume, prepared3D, histogram)
          .then((outcome) => {
            // Skipping the cache is not a user-facing failure — the volume is
            // already open, only the next reload will be slower. Worth a line
            // in the console though, or a silently uncached tab looks like a bug.
            if (!outcome.stored) {
              console.debug(
                `[volume-cache] skipped (${outcome.reason}) — ${Math.round(outcome.bytes / 1e6)} MB`,
              );
            }
          })
          .catch(() => {
            /* unexpected storage failure — the volume still loaded */
          });
      }),
    [viewer, navigate],
  );

  const openFiles = useCallback(
    (files: FileList | File[]) => {
      const picked = Array.from(files);
      if (picked.length === 0) return;
      void viewer.load(fromFileList(picked));
    },
    [viewer],
  );

  const openFolder = useCallback(async () => {
    const picker = (window as unknown as DirPickerWindow).showDirectoryPicker;
    if (!picker) {
      pickFiles({ directory: true }, openFiles);
      return;
    }
    try {
      const handle = await picker();
      await viewer.load(await fromDirectoryHandle(handle));
    } catch (err) {
      if (!isAbort(err)) {
        setError(err instanceof Error ? err.message : 'Folder pick failed.');
      }
    }
  }, [viewer, openFiles, setError]);

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
    () => ({ openFiles, openFolder, openFile, showShortcuts, setShowShortcuts }),
    [openFiles, openFolder, openFile, showShortcuts],
  );
}
