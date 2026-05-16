import { useVolumeStore } from '@/store/volumeStore';
import { SlicePanel } from '@/components/rail/SlicePanel';
import type { SlicePlane } from '@/types';

const PLANES: SlicePlane[] = ['coronal', 'sagittal', 'axial'];

export function Rail() {
  const railOpen = useVolumeStore((s) => s.toolbar.rail);
  if (!railOpen) return null;
  return (
    <aside
      style={{
        gridArea: 'rail',
        background: 'var(--panel)',
        borderBottom: '1px solid var(--rule)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {PLANES.map((p) => (
        <SlicePanel key={p} plane={p} />
      ))}
    </aside>
  );
}
