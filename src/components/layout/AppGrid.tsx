import { Dock } from '@/components/dock/Dock';
import { Header } from '@/components/header/Header';
import { Rail } from '@/components/rail/Rail';
import { Stage } from '@/components/stage/Stage';
import { useVolumeStore } from '@/store';
import styled from 'styled-components';

// ── Styled components ──────────────────────────────────────────────────────

const GridRoot = styled.div<{ $railOpen: boolean }>`
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: ${({ $railOpen }) => ($railOpen ? '1fr 360px' : '1fr 0px')};
  grid-template-rows: 56px minmax(0, 1fr);
  grid-template-areas: "header header" "stage rail";
  height: 100vh;
  width: 100vw;
  gap: 0;
`;

export function AppGrid() {
  const railOpen = useVolumeStore((s) => s.toolbar.rail);

  return (
    <GridRoot className="console" $railOpen={railOpen}>
      <Header />
      <Stage />
      <Rail />
      <Dock />
    </GridRoot>
  );
}
