import type {
  ActionId,
  ActionSource,
  Annotation,
  ConfigStorage,
  ViewControlsConfig,
} from '@prisma-mri/viewer-core';
import { type ReactNode, createContext, useContext, useMemo } from 'react';
import { useStore } from 'zustand';
import type { DeepPartial, ViewControlsMessages } from '../view-controls/messages';
import type { ViewerInstance } from './createViewer';
import { type ViewerFeatures, defaultFeatures } from './features';
import { type ViewerLabels, defaultLabels } from './labels';
import type { ViewerStore, ViewerStoreState } from './store';
import type { ViewerSurfaces } from './surfaces';
import { type ViewerTheme, defaultTheme } from './theme';
// Here, not in the barrel: every viewer — and every piece placed outside one —
// runs through this module, so the tokens can never be tree-shaken away.
import './tokens.css';

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

/**
 * The 3-D view controls (rotate / align / zoom keys and the on-screen panel).
 * Everything inside can also be switched off by the user in their settings.
 */
export interface ViewerViewControls {
  /** Controlled config — memoise it. Omitted: what `storage` holds, else defaults. */
  config?: unknown;
  /** Where the user's config is kept. Default: localStorage `prismamri.viewControls`; null: nowhere. */
  storage?: ConfigStorage | null;
  onConfigChange?: (config: ViewControlsConfig) => void;
  /** Every dispatched action, e.g. for analytics. */
  onAction?: (id: ActionId, source: ActionSource) => void;
  /** Any of the panel's words. */
  messages?: DeepPartial<ViewControlsMessages>;
}

/** What the host plugs into the viewer: its slots and its way out. */
export interface ViewerHost {
  slots: ViewerSlots;
  /** Offered as "Back" in the session panel. Without it, the button is not shown. */
  onExit?: () => void;
  /** Options for the 3-D view controls. Keep the object stable. */
  viewControls?: ViewerViewControls;
}

interface ViewerContextValue extends ViewerEnvironment, ViewerHost {
  viewer: ViewerInstance;
}

const NO_SLOTS: ViewerSlots = {};

const ViewerContext = createContext<ViewerContextValue | null>(null);

export interface ViewerProviderProps extends Partial<ViewerEnvironment> {
  viewer: ViewerInstance;
  /** Keep the object stable (module-level or memoised): it is part of the context value. */
  slots?: ViewerSlots;
  onExit?: () => void;
  /** Keep the object stable (module-level or memoised): it is part of the context value. */
  viewControls?: ViewerViewControls;
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
  viewControls,
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
      viewControls,
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
      viewControls,
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
export function useViewer(): ViewerInstance {
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
  const { slots, onExit, viewControls } = useViewerContext();
  return { slots, onExit, viewControls };
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
