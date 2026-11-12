import { Dock } from '@/components/dock/Dock';
import { MobileControlsView } from '@/components/mobile/MobileControlsView';
import { MobileTabBar, isTabOffered } from '@/components/mobile/MobileTabBar';
import { Rail } from '@/components/rail/Rail';
import { SlicePanel } from '@/components/rail/SlicePanel';
import { Stage } from '@/components/stage/Stage';
import { isSlicePlane } from '@/constants';
import { useViewerStoreEffects } from '@/hooks/useViewerStoreEffects';
import {
  type Viewer as ViewerInstance,
  type ViewerLayout,
  ViewerProvider,
  type ViewerSlots,
  useViewerFeatures,
  useViewerStore,
} from '@/viewer';
import { type ViewerFeatures, resolveFeatures } from '@/viewer/features';
import { type ViewerLabelsInput, resolveLabels } from '@/viewer/labels';
import { type ViewerLayoutMode, useContainerLayout } from '@/viewer/layout';
import { type ViewerThemeInput, resolveTheme, themeCssVars } from '@/viewer/theme';
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import styled from 'styled-components';

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
  className?: string;
  style?: CSSProperties;
}

/**
 * Fills its container. `isolation` keeps the viewer's own stacking — dock,
 * focus mode, the findings card — from reaching over the host's page.
 */
const ViewerRoot = styled.div`
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;

  /* Focusable only so a click inside gives the shortcuts somewhere to land. */
  &:focus {
    outline: none;
  }
`;

const DesktopGrid = styled.div<{ $railOpen: boolean }>`
  display: grid;
  grid-template-columns: ${({ $railOpen }) => ($railOpen ? '1fr 360px' : '1fr 0px')};
  grid-template-rows: minmax(0, 1fr);
  grid-template-areas: "stage rail";
  height: 100%;
`;

const MobileColumn = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

/** Content area above the tab bar. */
const MobileContent = styled.div`
  flex: 1;
  position: relative;
  min-height: 0;
  overflow: hidden;
`;

/** Wraps the 3D Stage. Always in the DOM to preserve the WebGL context. */
const StageWrap = styled.div<{ $visible: boolean }>`
  position: absolute;
  inset: 0;
  /* Use visibility (not display) so getBoundingClientRect keeps correct dims. */
  visibility: ${({ $visible }) => ($visible ? 'visible' : 'hidden')};
  pointer-events: ${({ $visible }) => ($visible ? 'auto' : 'none')};
`;

/** Full-bleed wrapper for a single slice panel on mobile. */
const MobileSliceWrap = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
`;

/** Scrollable container for the controls tab. */
const MobileControlsWrap = styled.div`
  position: absolute;
  inset: 0;
`;

function DesktopViewer() {
  const features = useViewerFeatures();
  const railOpen = useViewerStore((s) => s.toolbar.rail) && features.rail;
  return (
    <DesktopGrid $railOpen={railOpen}>
      <Stage />
      {features.rail && <Rail />}
      {features.dock && <Dock />}
    </DesktopGrid>
  );
}

function MobileViewer() {
  const features = useViewerFeatures();
  const storedTab = useViewerStore((s) => s.mobileTab);
  const mobileTab = isTabOffered(storedTab, features) ? storedTab : '3d';
  const volumeLoaded = useViewerStore((s) => s.volume !== null);
  return (
    <MobileColumn>
      <MobileContent>
        {/* Stage stays mounted at all times to preserve the WebGL/Three.js context. */}
        <StageWrap $visible={mobileTab === '3d'}>
          <Stage />
        </StageWrap>

        {/* isSlicePlane narrows mobileTab → SlicePlane for the SlicePanel prop. */}
        {isSlicePlane(mobileTab) && (
          <MobileSliceWrap>
            <SlicePanel plane={mobileTab} />
          </MobileSliceWrap>
        )}

        {/* Controls view — replaces the Dock on mobile. */}
        {mobileTab === 'controls' && (
          <MobileControlsWrap>
            <MobileControlsView />
          </MobileControlsWrap>
        )}
      </MobileContent>

      {/* Tab bar only shown while viewing a loaded volume. */}
      {volumeLoaded && <MobileTabBar />}
    </MobileColumn>
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
    <ViewerRoot
      ref={setRoot}
      tabIndex={-1}
      data-layout={layout ?? undefined}
      className={className}
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
        >
          <ViewerEffects />
          {layout === 'mobile' ? <MobileViewer /> : <DesktopViewer />}
        </ViewerProvider>
      )}
    </ViewerRoot>
  );
}
