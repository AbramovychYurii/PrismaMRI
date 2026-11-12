import { BrandBlock } from '@/components/header/BrandBlock';
import { Header } from '@/components/header/Header';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import {
  Tooltip,
  Viewer,
  type ViewerSlots,
  accentAlpha,
  useViewer,
  useViewerStore,
} from '@prisma-mri/viewer-react';
import { MonitorDown } from 'lucide-react';
import styled from 'styled-components';

/**
 * Header above the viewer. In focus mode the header row folds away, so the
 * stage fills the window as it did when the app and the viewer were one grid.
 */
const GridRoot = styled.div<{ $focus: boolean }>`
  position: relative;
  z-index: var(--z-layout);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: ${({ $focus }) => ($focus ? '0' : '56px')} minmax(0, 1fr);
  grid-template-areas: "header" "viewer";
  height: 100vh;
  width: 100vw;
`;

const ViewerArea = styled.div`
  grid-area: viewer;
  min-height: 0;
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

const MobileViewerArea = styled.div`
  flex: 1;
  min-height: 0;
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
    background: ${accentAlpha('amber', 0.08)};
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
  box-shadow: 0 0 6px ${accentAlpha('amber', 0.6)};
`;

function MobileHeader() {
  const loadingPercent = useViewerStore((s) => (s.loading.active ? s.loading.percent : null));
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
      {loadingPercent !== null && <MobileLoadingBar $width={loadingPercent} />}
    </MobileHeaderBar>
  );
}

interface AppGridProps {
  slots: ViewerSlots;
  onExit: () => void;
}

/**
 * The app's shell around the viewer: its header (brand, run strip, install,
 * help) on top, the viewer below. The app fills the window, so the viewer's
 * layout follows the window's width and its shortcuts listen on the window.
 */
export function AppGrid({ slots, onExit }: AppGridProps) {
  const viewer = useViewer();
  const isMobile = useIsMobile();
  const focus = useViewerStore((s) => s.toolbar.focus);

  const content = (
    <Viewer
      viewer={viewer}
      layout={isMobile ? 'mobile' : 'desktop'}
      keyboardTarget={window}
      slots={slots}
      onExit={onExit}
    />
  );

  if (!isMobile) {
    return (
      <GridRoot className="console" $focus={focus}>
        {!focus && <Header />}
        <ViewerArea>{content}</ViewerArea>
      </GridRoot>
    );
  }

  return (
    <MobileRoot>
      <MobileHeader />
      <MobileViewerArea>{content}</MobileViewerArea>
    </MobileRoot>
  );
}
