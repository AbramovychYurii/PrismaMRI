import { Dock } from '@/components/dock/Dock';
import { MobileControlsView } from '@/components/mobile/MobileControlsView';
import { MobileTabBar } from '@/components/mobile/MobileTabBar';
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
  useViewerStore,
} from '@/viewer';
import { type ViewerLayoutMode, useContainerLayout } from '@/viewer/layout';
import { type CSSProperties, useState } from 'react';
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
  /** Where menus and tooltips are portalled. Defaults to the page body. */
  portalContainer?: Element;
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
  const railOpen = useViewerStore((s) => s.toolbar.rail);
  return (
    <DesktopGrid $railOpen={railOpen}>
      <Stage />
      <Rail />
      <Dock />
    </DesktopGrid>
  );
}

function MobileViewer() {
  const mobileTab = useViewerStore((s) => s.mobileTab);
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

/** The debounced W/L commit and the plane keys — one set per viewer. */
function ViewerEffects() {
  useViewerStoreEffects();
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
  slots,
  onExit,
  className,
  style,
}: ViewerProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const layout: ViewerLayout | null = useContainerLayout(root, layoutMode);

  return (
    <ViewerRoot
      ref={setRoot}
      tabIndex={-1}
      data-layout={layout ?? undefined}
      className={className}
      style={style}
    >
      {root && layout && (
        <ViewerProvider
          viewer={viewer}
          keyboardTarget={keyboardTarget === undefined ? root : keyboardTarget}
          portalContainer={portalContainer}
          layout={layout}
          rootElement={root}
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
