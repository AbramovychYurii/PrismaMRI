import { Dock } from '@/components/dock/Dock';
import { BrandBlock } from '@/components/header/BrandBlock';
import { Header } from '@/components/header/Header';
import { MobileControlsView } from '@/components/mobile/MobileControlsView';
import { MobileTabBar } from '@/components/mobile/MobileTabBar';
import { Rail } from '@/components/rail/Rail';
import { SlicePanel } from '@/components/rail/SlicePanel';
import { Stage } from '@/components/stage/Stage';
import { Tooltip } from '@/components/ui/Tooltip';
import { accentRgba, isSlicePlane } from '@/constants';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { useVolumeStore } from '@/store';
import { MonitorDown } from 'lucide-react';
import styled from 'styled-components';

const GridRoot = styled.div<{ $railOpen: boolean }>`
  position: relative;
  z-index: var(--z-layout);
  display: grid;
  grid-template-columns: ${({ $railOpen }) => ($railOpen ? '1fr 360px' : '1fr 0px')};
  grid-template-rows: 56px minmax(0, 1fr);
  grid-template-areas: "header header" "stage rail";
  height: 100vh;
  width: 100vw;
  gap: 0;
`;

const MobileRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100dvh; /* dynamic viewport height — accounts for browser chrome */
  width: 100vw;
  overflow: hidden;
  position: relative;
  z-index: var(--z-layout);
`;

const MobileHeaderBar = styled.header`
  flex-shrink: 0;
  height: 48px;
  display: flex;
  align-items: center;
  background: var(--panel);
  border-bottom: 1px solid var(--rule);
  position: relative;
  /* Account for notch on left (landscape) */
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
`;

/** Pushes install button to the right edge of the mobile header. */
const MobileHeaderSpacer = styled.div`
  flex: 1;
`;

const MobileInstallBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-right: 12px;
  border-radius: 4px;
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;

  &:active {
    background: ${accentRgba('amber', 0.08)};
    border-color: var(--amber-dim);
    color: var(--amber);
  }
`;

const MobileLoadingBar = styled.div<{ $width: number }>`
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  width: ${({ $width }) => $width}%;
  background: var(--amber);
  transition: width 180ms ease-out;
  box-shadow: 0 0 6px ${accentRgba('amber', 0.6)};
`;

/** Content area between header and tab bar. */
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

function MobileHeader() {
  const loading = useVolumeStore((s) => s.loading);
  const { canInstall, install } = usePwaInstall();
  return (
    <MobileHeaderBar>
      <BrandBlock />
      <MobileHeaderSpacer />
      {canInstall && (
        <Tooltip label="Install PrismaMRI as an app">
          <MobileInstallBtn type="button" aria-label="Install app" onClick={install}>
            <MonitorDown size={16} />
          </MobileInstallBtn>
        </Tooltip>
      )}
      {loading.active && <MobileLoadingBar $width={loading.percent} />}
    </MobileHeaderBar>
  );
}

export function AppGrid() {
  const isMobile = useIsMobile();
  const railOpen = useVolumeStore((s) => s.toolbar.rail);
  const mobileTab = useVolumeStore((s) => s.mobileTab);
  const volumeLoaded = useVolumeStore((s) => s.volume !== null);

  if (!isMobile) {
    return (
      <GridRoot className="console" $railOpen={railOpen}>
        <Header />
        <Stage />
        <Rail />
        <Dock />
      </GridRoot>
    );
  }

  return (
    <MobileRoot>
      <MobileHeader />

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
    </MobileRoot>
  );
}
