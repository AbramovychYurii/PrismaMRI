import type { SlicePlane } from '@prisma-mri/viewer-core';
import { useViewerStore } from '../../viewer';
import styles from './Rail.module.css';
import { SlicePanel } from './SlicePanel';

const PLANES: SlicePlane[] = ['coronal', 'sagittal', 'axial'];

export function Rail() {
  const railOpen = useViewerStore((s) => s.toolbar.rail);
  if (!railOpen) return null;
  return (
    <aside className={styles.railAside} data-key-zone="slices">
      {PLANES.map((p) => (
        <SlicePanel key={p} plane={p} />
      ))}
    </aside>
  );
}
