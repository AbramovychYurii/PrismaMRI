import type { Annotation } from '@/types';
import type { Viewer } from '@/viewer/createViewer';
import { type ViewerFeatures, defaultFeatures } from '@/viewer/features';
import { type ViewerLabels, defaultLabels } from '@/viewer/labels';
import type { ViewerStore, ViewerStoreState } from '@/viewer/store';
import type { ViewerSurfaces } from '@/viewer/surfaces';
import { type ViewerTheme, defaultTheme } from '@/viewer/theme';
import { type ReactNode, createContext, useContext, useMemo } from 'react';
import { useStore } from 'zustand';

/** Which arrangement the viewer is drawn in: rail beside the stage, or tabs. */
export type ViewerLayout = 'desktop' | 'mobile';

export interface ViewerEnvironment {
  /**
   * Where the viewer listens for its keyboard shortcuts (↑/↓ step, 1/2/3
   * focus). `window` suits a full-page viewer; an embedded one passes its own
   * container so the keys work only while focus is inside it. `null` turns the
   * shortcuts off.
   */
  keyboardTarget: EventTarget | null;
  /** Where menus and tooltips are portalled. */
  portalContainer: Element;
  layout: ViewerLayout;
  /**
   * The element the viewer is drawn in, once mounted. Overlays that must stay
   * inside the viewer (the fullscreen slice panel) render here, and lookups
   * that must not reach another viewer on the page are scoped to it.
   */
  rootElement: HTMLElement | null;
  /** Resolved theme — for what CSS can't reach: canvas fills, the 3-D view. */
  theme: ViewerTheme;
  features: ViewerFeatures;
  labels: ViewerLabels;
}

/** The finding a navigator action is rendered for. */
export interface AnnotationActionContext {
  finding: Annotation;
  /** Position of `finding` within `all`. */
  index: number;
  /** Every finding on the volume, most severe first. */
  all: Annotation[];
}

/** Places where a host renders its own UI inside the viewer. */
export interface ViewerSlots {
  /** Drawn over the 3-D stage, and hidden in focus mode with the rest of the chrome. */
  stageOverlay?: ReactNode;
  /**
   * Extra buttons in the findings card footer, before Dismiss — an export, a
   * share. Return a component element, not bare markup, so its state survives
   * stepping between findings.
   */
  annotationActions?: (context: AnnotationActionContext) => ReactNode;
  /** One line under the open findings card, e.g. a hint for the actions above. */
  annotationHint?: ReactNode;
}

/** What the host plugs into the viewer: its slots and its way out. */
export interface ViewerHost {
  slots: ViewerSlots;
  /** Offered as "Back" in the session panel. Without it, the button is not shown. */
  onExit?: () => void;
}

interface ViewerContextValue extends ViewerEnvironment, ViewerHost {
  viewer: Viewer;
}

const NO_SLOTS: ViewerSlots = {};

const ViewerContext = createContext<ViewerContextValue | null>(null);

export interface ViewerProviderProps extends Partial<ViewerEnvironment> {
  viewer: Viewer;
  /** Keep the object stable (module-level or memoised): it is part of the context value. */
  slots?: ViewerSlots;
  onExit?: () => void;
  children: ReactNode;
}

export function ViewerProvider({
  viewer,
  keyboardTarget = typeof window === 'undefined' ? null : window,
  portalContainer = document.body,
  layout = 'desktop',
  rootElement = null,
  theme = defaultTheme,
  features = defaultFeatures,
  labels = defaultLabels,
  slots = NO_SLOTS,
  onExit,
  children,
}: ViewerProviderProps) {
  // Every hook below reads this context, so a fresh object per render would
  // re-render every consumer whenever the provider's parent does.
  const value = useMemo(
    () => ({
      viewer,
      keyboardTarget,
      portalContainer,
      layout,
      rootElement,
      theme,
      features,
      labels,
      slots,
      onExit,
    }),
    [
      viewer,
      keyboardTarget,
      portalContainer,
      layout,
      rootElement,
      theme,
      features,
      labels,
      slots,
      onExit,
    ],
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

/** The host's slots and exit, as given to the provider. */
export function useViewerHost(): ViewerHost {
  const { slots, onExit } = useViewerContext();
  return { slots, onExit };
}

export function useViewerEnvironment(): ViewerEnvironment {
  const { keyboardTarget, portalContainer, layout, rootElement, theme, features, labels } =
    useViewerContext();
  return { keyboardTarget, portalContainer, layout, rootElement, theme, features, labels };
}

/** The viewer's words — defaults, or the host's labels; also outside a viewer. */
export function useViewerLabels(): ViewerLabels {
  return useContext(ViewerContext)?.labels ?? defaultLabels;
}

export function useViewerFeatures(): ViewerFeatures {
  return useViewerContext().features;
}

export function useViewerTheme(): ViewerTheme {
  return useViewerContext().theme;
}

export function useViewerLayout(): ViewerLayout {
  return useViewerContext().layout;
}
