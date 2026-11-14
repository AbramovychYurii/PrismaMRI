import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { isSlicePlane } from '../constants';
import { useViewerStoreEffects } from '../hooks/useViewerStoreEffects';
import {
  type ViewerInstance,
  type ViewerLayout,
  ViewerProvider,
  type ViewerSlots,
  type ViewerViewControls,
  useViewerFeatures,
  useViewerStore,
} from '../viewer';
import { type ViewerFeatures, resolveFeatures } from '../viewer/features';
import { type ViewerLabelsInput, resolveLabels } from '../viewer/labels';
import { type ViewerLayoutMode, useContainerLayout } from '../viewer/layout';
import { type ViewerThemeInput, resolveTheme, themeCssVars } from '../viewer/theme';
import { ViewControlsHost } from './ViewControlsHost';
import styles from './Viewer.module.css';
import { Dock } from './dock/Dock';
import { MobileControlsView } from './mobile/MobileControlsView';
import { MobileTabBar, isTabOffered } from './mobile/MobileTabBar';
import { Rail } from './rail/Rail';
import { SlicePanel } from './rail/SlicePanel';
import { Stage } from './stage/Stage';

export interface ViewerProps {
  viewer: ViewerInstance;
  /** `auto` (default) picks tabs or rail from the container's width. */
  layout?: ViewerLayoutMode;
  /**
   * Where the keyboard shortcuts listen. Defaults to the viewer itself, so they
   * work while focus is inside it; a full-page viewer passes `window`, and
   * `null` turns them off.
   */
  keyboardTarget?: EventTarget | null;
  /**
   * Where menus and tooltips are portalled. Defaults to the page body. They
   * render inside a wrapper there that carries the viewer's theme and layout.
   */
  portalContainer?: Element;
  /** Any part of the theme; the rest stays default. Keep the object stable. */
  theme?: ViewerThemeInput;
  /** Turn parts of the viewer off; everything is on by default. Keep the object stable. */
  features?: Partial<ViewerFeatures>;
  /** Any of the viewer's words, to translate or rename. Keep the object stable. */
  labels?: ViewerLabelsInput;
  /** Keep the object stable (module-level or memoised). */
  slots?: ViewerSlots;
  /** Offered as "Back" in the session panel. */
  onExit?: () => void;
  /**
   * The 3-D view controls: their config (controlled, or kept in `storage`),
   * change and action callbacks, words. Keep the object stable.
   */
  viewControls?: ViewerViewControls;
  className?: string;
  style?: CSSProperties;
}

function DesktopViewer() {
  const features = useViewerFeatures();
  const railOpen = useViewerStore((s) => s.toolbar.rail) && features.rail;
  return (
    <div className={styles.desktopGrid} data-rail={railOpen || undefined}>
      <Stage />
      {features.rail && <Rail />}
      {features.dock && <Dock />}
    </div>
  );
}

function MobileViewer() {
  const features = useViewerFeatures();
  const storedTab = useViewerStore((s) => s.mobileTab);
  const mobileTab = isTabOffered(storedTab, features) ? storedTab : '3d';
  const volumeLoaded = useViewerStore((s) => s.volume !== null);
  return (
    <div className={styles.mobileColumn}>
      <div className={styles.mobileContent}>
        {/* Stage stays mounted at all times to preserve the WebGL/Three.js context. */}
        <div className={styles.stageWrap} data-visible={mobileTab === '3d' || undefined}>
          <Stage />
        </div>

        {/* isSlicePlane narrows mobileTab → SlicePlane for the SlicePanel prop. */}
        {isSlicePlane(mobileTab) && (
          <div className={styles.mobileSliceWrap}>
            <SlicePanel plane={mobileTab} />
          </div>
        )}

        {/* Controls view — replaces the Dock on mobile. */}
        {mobileTab === 'controls' && (
          <div className={styles.mobileControlsWrap}>
            <MobileControlsView />
          </div>
        )}
      </div>

      {/* Tab bar only shown while viewing a loaded volume. */}
      {volumeLoaded && <MobileTabBar />}
    </div>
  );
}

/**
 * A wrapper for this viewer's menus and tooltips inside `host`: portalled
 * content sits outside the viewer's root, so it gets the theme variables and
 * the layout attribute from here instead.
 */
function usePortalRoot(
  host: Element | undefined,
  vars: Record<string, string>,
  layout: ViewerLayout | null,
): HTMLDivElement | null {
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = document.createElement('div');
    el.className = 'pmri-portal';
    (host ?? document.body).appendChild(el);
    setPortalRoot(el);
    return () => {
      el.remove();
      setPortalRoot(null);
    };
  }, [host]);

  useLayoutEffect(() => {
    if (!portalRoot) return;
    for (const [name, value] of Object.entries(vars)) portalRoot.style.setProperty(name, value);
    if (layout) portalRoot.dataset.layout = layout;
  }, [portalRoot, vars, layout]);

  return portalRoot;
}

/**
 * Keeps the render preset among those offered — a fresh load starts on MIP,
 * which a host may have left out.
 */
function useOfferedPreset(): void {
  const { renderPresets } = useViewerFeatures();
  const preset = useViewerStore((s) => s.renderPreset);
  const setRenderPreset = useViewerStore((s) => s.setRenderPreset);
  useEffect(() => {
    if (!renderPresets.includes(preset)) setRenderPreset(renderPresets[0]);
  }, [renderPresets, preset, setRenderPreset]);
}

/** The debounced W/L commit, the plane keys and the preset rule — one set per viewer. */
function ViewerEffects() {
  useViewerStoreEffects();
  useOfferedPreset();
  return null;
}

/**
 * The whole viewer — 3-D stage, slice panels, controls — sized to its
 * container: the rail beside the stage when there is room, tabs when not.
 */
export function Viewer({
  viewer,
  layout: layoutMode = 'auto',
  keyboardTarget,
  portalContainer,
  theme: themeInput,
  features: featuresInput,
  labels: labelsInput,
  slots,
  onExit,
  viewControls,
  className,
  style,
}: ViewerProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const layout: ViewerLayout | null = useContainerLayout(root, layoutMode);
  const theme = useMemo(() => resolveTheme(themeInput), [themeInput]);
  const vars = useMemo(() => themeCssVars(theme), [theme]);
  const features = useMemo(() => resolveFeatures(featuresInput), [featuresInput]);
  const labels = useMemo(() => resolveLabels(labelsInput), [labelsInput]);
  const rootStyle = useMemo(() => ({ ...vars, ...style }) as CSSProperties, [vars, style]);
  const portalRoot = usePortalRoot(portalContainer, vars, layout);

  return (
    <div
      ref={setRoot}
      tabIndex={-1}
      data-layout={layout ?? undefined}
      className={
        className ? `pmri-root ${styles.viewerRoot} ${className}` : `pmri-root ${styles.viewerRoot}`
      }
      style={rootStyle}
    >
      {root && layout && portalRoot && (
        <ViewerProvider
          viewer={viewer}
          keyboardTarget={keyboardTarget === undefined ? root : keyboardTarget}
          portalContainer={portalRoot}
          layout={layout}
          rootElement={root}
          theme={theme}
          features={features}
          labels={labels}
          slots={slots}
          onExit={onExit}
          viewControls={viewControls}
        >
          <ViewControlsHost>
            <ViewerEffects />
            {layout === 'mobile' ? <MobileViewer /> : <DesktopViewer />}
          </ViewControlsHost>
        </ViewerProvider>
      )}
    </div>
  );
}
