import { localStorageConfigStorage } from '@prisma-mri/viewer-core';
import { type ReactNode, useCallback } from 'react';
import { arrowsGoToStage, useKeyZoneTracking } from '../hooks/useKeyZone';
import { ViewControlsProvider } from '../view-controls/context';
import '../view-controls/styles.css';
import { useViewerEnvironment, useViewerHost, useViewerStoreApi } from '../viewer';

/** Where the user's view-control settings are kept unless the host says otherwise. */
const DEFAULT_STORAGE = localStorageConfigStorage('prismamri.viewControls');

const ARROWS_UP_DOWN = new Set(['ArrowUp', 'ArrowDown']);

/** A modal outside the view controls owns the keyboard. */
const hostModalOpen = () =>
  typeof document !== 'undefined' && document.querySelector('[aria-modal="true"]') !== null;

/**
 * One view-controls controller per viewer, around the whole viewer so the
 * slice keys can defer to it. The stage hands it the 3-D target once a volume
 * is loaded (`controller.setTarget`).
 */
export function ViewControlsHost({ children }: { children: ReactNode }) {
  const { keyboardTarget, rootElement, layout, features } = useViewerEnvironment();
  const { viewControls } = useViewerHost();
  const store = useViewerStoreApi();
  useKeyZoneTracking(rootElement);

  const shouldHandleKey = useCallback(
    (e: KeyboardEvent) => {
      if (hostModalOpen()) return false;
      const state = store.getState();
      // On the tabbed layout the 3-D view is hidden behind any other tab.
      if (layout === 'mobile' && state.mobileTab !== '3d') return false;
      if (ARROWS_UP_DOWN.has(e.code) && !arrowsGoToStage(rootElement, layout, state, features)) {
        return false;
      }
      return true;
    },
    [store, layout, features, rootElement],
  );

  const storage =
    viewControls?.storage === undefined ? DEFAULT_STORAGE : (viewControls.storage ?? undefined);

  return (
    <ViewControlsProvider
      config={viewControls?.config}
      storage={storage}
      onConfigChange={viewControls?.onConfigChange}
      onAction={viewControls?.onAction}
      messages={viewControls?.messages}
      keyboardScope={keyboardTarget}
      viewerElement={rootElement}
      shouldHandleKey={shouldHandleKey}
    >
      {children}
    </ViewControlsProvider>
  );
}
