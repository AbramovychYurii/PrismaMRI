import type { Viewer } from '@/viewer/createViewer';
import type { ViewerStore, ViewerStoreState } from '@/viewer/store';
import type { ViewerSurfaces } from '@/viewer/surfaces';
import { type ReactNode, createContext, useContext, useMemo } from 'react';
import { useStore } from 'zustand';

export interface ViewerEnvironment {
  /**
   * Where the viewer listens for its keyboard shortcuts (↑/↓ step, 1/2/3
   * focus). `window` suits a full-page viewer; an embedded one passes its own
   * container so the keys work only while focus is inside it. `null` turns the
   * shortcuts off.
   */
  keyboardTarget: EventTarget | null;
  /** Where menus, tooltips and the fullscreen panel are portalled. */
  portalContainer: Element;
}

interface ViewerContextValue extends ViewerEnvironment {
  viewer: Viewer;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

export interface ViewerProviderProps extends Partial<ViewerEnvironment> {
  viewer: Viewer;
  children: ReactNode;
}

export function ViewerProvider({
  viewer,
  keyboardTarget = typeof window === 'undefined' ? null : window,
  portalContainer = document.body,
  children,
}: ViewerProviderProps) {
  // Every hook below reads this context, so a fresh object per render would
  // re-render every consumer whenever the provider's parent does.
  const value = useMemo(
    () => ({ viewer, keyboardTarget, portalContainer }),
    [viewer, keyboardTarget, portalContainer],
  );
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

function useViewerContext(): ViewerContextValue {
  const value = useContext(ViewerContext);
  if (!value) throw new Error('Viewer hooks must be used within <ViewerProvider>');
  return value;
}

/** The surrounding viewer itself — for code that drives it from outside React. */
export function useViewer(): Viewer {
  return useViewerContext().viewer;
}

/** Subscribes to a slice of the surrounding viewer's state. */
export function useViewerStore<T>(selector: (state: ViewerStoreState) => T): T {
  return useStore(useViewerContext().viewer.store, selector);
}

/** The surrounding viewer's store, for reads and writes outside render. */
export function useViewerStoreApi(): ViewerStore {
  return useViewerContext().viewer.store;
}

export function useViewerSurfaces(): ViewerSurfaces {
  return useViewerContext().viewer.surfaces;
}

/**
 * Where overlays are portalled: the surrounding viewer's container, or the
 * page body for UI rendered outside any viewer (the import screen's tooltips).
 */
export function usePortalContainer(): Element {
  return useContext(ViewerContext)?.portalContainer ?? document.body;
}

export function useViewerEnvironment(): ViewerEnvironment {
  const { keyboardTarget, portalContainer } = useViewerContext();
  return { keyboardTarget, portalContainer };
}
