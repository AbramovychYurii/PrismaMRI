/**
 * StageSeriesSelect — top-left stage control for switching the displayed DICOM
 * series in place. Visible only when the active volume came from a multi-series
 * import this session (the source + series list are retained in the store).
 * Picking a series re-assembles it from the retained files via `switchSeries`.
 */

import type { SeriesChoice } from '@prisma-mri/viewer-core';
import { ChevronDown, Layers } from 'lucide-react';
import { useViewer, useViewerFeatures, useViewerStore } from '../../viewer';
import styles from './StageSeriesSelect.module.css';

function optionLabel(s: SeriesChoice): string {
  const bits = [s.label, s.orientation, `${s.count} sl`].filter(Boolean);
  return bits.join(' · ');
}

export function StageSeriesSelect() {
  const seriesList = useViewerStore((s) => s.seriesList);
  const activeSeriesKey = useViewerStore((s) => s.activeSeriesKey);
  const loading = useViewerStore((s) => s.loading.active);
  const { switchSeries } = useViewer();

  const { seriesSelect } = useViewerFeatures();
  if (!seriesSelect || !seriesList || seriesList.length <= 1) return null;

  return (
    <div className={styles.wrap}>
      <span className={styles.iconWrap} aria-hidden="true">
        <Layers size={15} />
      </span>
      <div className={styles.selectInner}>
        <select
          className={styles.select}
          aria-label="Switch series"
          value={activeSeriesKey ?? ''}
          disabled={loading}
          onChange={(e) => switchSeries(e.target.value)}
        >
          {seriesList.map((s) => (
            <option key={s.key} value={s.key}>
              {optionLabel(s)}
            </option>
          ))}
        </select>
        <ChevronDown className={styles.chevron} size={14} aria-hidden="true" />
      </div>
    </div>
  );
}
