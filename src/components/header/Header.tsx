import { BrandBlock } from '@/components/header/BrandBlock';
import { RunStrip } from '@/components/header/RunStrip';
import { accentRgba } from '@/constants';
import { useVolumeStore } from '@/store';
import styled from 'styled-components';

// ── Styled components ──────────────────────────────────────────────────────

const StyledHeader = styled.header`
  grid-area: header;
  border-bottom: 1px solid var(--rule);
  background: var(--panel);
  display: grid;
  grid-template-columns: 280px 1fr auto;
  align-items: stretch;
  position: relative;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 22px;
  border-left: 1px solid var(--rule);
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

  return (
    <StyledHeader>
      <BrandBlock />
      <RunStrip />
      <HeaderRight />
      {loading.active && <LoadingBar $width={loading.percent} />}
    </StyledHeader>
  );
}
