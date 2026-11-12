import { SlicePanel } from '@/components/rail/SlicePanel';
import type { SlicePlane } from '@/types';
import { useViewerStore } from '@/viewer';
import styled from 'styled-components';

const RailAside = styled.aside`
  grid-area: rail;
  background: var(--panel);
  border-bottom: 1px solid var(--rule);
  display: flex;
  flex-direction: column;
  overflow: visible;
`;

const PLANES: SlicePlane[] = ['coronal', 'sagittal', 'axial'];

export function Rail() {
  const railOpen = useViewerStore((s) => s.toolbar.rail);
  if (!railOpen) return null;
  return (
    <RailAside>
      {PLANES.map((p) => (
        <SlicePanel key={p} plane={p} />
      ))}
    </RailAside>
  );
}
