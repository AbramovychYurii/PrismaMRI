/**
 * StageSeriesLoading — veils the stage while another series loads. Re-assembling
 * a series can freeze the page for seconds; without the veil a click on the
 * series list or on the next finding looks like nothing happened.
 */

import { seriesLabel } from '@prisma-mri/viewer-core/unstable';
import { useViewerLabels, useViewerStore } from '../../viewer';
import styles from './StageSeriesLoading.module.css';

export function StageSeriesLoading() {
  const key = useViewerStore((s) => s.switchingSeriesKey);
  const name = useViewerStore((s) => seriesLabel(s.seriesList, key));
  const labels = useViewerLabels();
  if (key === null) return null;

  return (
    <output className={styles.veil} aria-busy="true">
      <div className={styles.card}>
        <span className={styles.spinner} aria-hidden="true" />
        <span className={styles.text}>
          {labels.stage.switchingSeries}
          {name && <span className={styles.name}> {name}</span>}
        </span>
      </div>
    </output>
  );
}
