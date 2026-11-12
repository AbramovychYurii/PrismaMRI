import { SlicePanel } from '@/components/rail/SlicePanel';
import type { SlicePlane } from '@/types';
import { useViewerStore } from '@/viewer';
import styles from './Rail.module.css';

const PLANES: SlicePlane[] = ['coronal', 'sagittal', 'axial'];

export function Rail() {
  const railOpen = useViewerStore((s) => s.toolbar.rail);
  if (!railOpen) return null;
  return (
    <aside className={styles.railAside}>
      {PLANES.map((p) => (
        <SlicePanel key={p} plane={p} />
      ))}
    </aside>
  );
}
