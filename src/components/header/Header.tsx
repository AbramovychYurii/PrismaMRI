import { BrandBlock } from '@/components/header/BrandBlock';
import { RunStrip } from '@/components/header/RunStrip';
import { Tooltip } from '@/components/ui/Tooltip';
import { accentRgba } from '@/constants';
import { useViewerActions } from '@/hooks/ViewerActionsContext';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { useVolumeStore } from '@/store';
import { MonitorDown } from 'lucide-react';
import styled from 'styled-components';

// ── Styled components ──────────────────────────────────────────────────────

const StyledHeader = styled.header`
  grid-area: header;
  border-bottom: 1px solid var(--rule);
  background: var(--panel);
  display: grid;
  grid-template-columns: 280px 1fr auto auto;
  align-items: stretch;
  position: relative;
`;

const HeaderSection = styled.div`
  display: flex;
  align-items: center;
  padding: 0 18px;
  border-left: 1px solid var(--rule);
`;

const HeaderRight = styled(HeaderSection)`
  gap: 18px;
  padding: 0 22px;
`;

const InstallBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border-radius: 4px;
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-3);
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  cursor: pointer;
  white-space: nowrap;
  transition: background 80ms, border-color 80ms, color 80ms;

  &:hover {
    background: ${accentRgba('amber', 0.08)};
    border-color: var(--amber-dim);
    color: var(--amber);
  }

  @media (max-width: 767px) {
    padding: 0 8px;
    font-size: 0; /* hide text on mobile, keep icon */
    gap: 0;
  }
`;

const HelpBtn = styled.button`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid var(--rule-2);
  background: transparent;
  color: var(--ink-3);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    border-color: var(--amber);
    color: var(--amber);
  }
`;

const LoadingBar = styled.div<{ $width: number }>`
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  width: ${({ $width }) => $width}%;
  background: var(--amber);
  transition: width 180ms ease-out;
  box-shadow: 0 0 6px ${accentRgba('amber', 0.6)};
`;

export function Header() {
  const loading = useVolumeStore((s) => s.loading);
  const { setShowShortcuts } = useViewerActions();
  const { canInstall, install } = usePwaInstall();

  return (
    <StyledHeader>
      <BrandBlock />
      <RunStrip />
      {canInstall && (
        <HeaderSection>
          <Tooltip label="Install PrismaMRI as an app">
            <InstallBtn type="button" aria-label="Install app" onClick={install}>
              <MonitorDown size={16} />
            </InstallBtn>
          </Tooltip>
        </HeaderSection>
      )}
      <HeaderRight>
        <Tooltip label="Keyboard shortcuts (?)">
          <HelpBtn
            type="button"
            aria-label="Keyboard shortcuts"
            onClick={() => setShowShortcuts(true)}
          >
            ?
          </HelpBtn>
        </Tooltip>
      </HeaderRight>
      {loading.active && <LoadingBar $width={loading.percent} />}
    </StyledHeader>
  );
}
