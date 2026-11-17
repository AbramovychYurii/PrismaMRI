/**
 * StageSeriesSelect — top-left stage control for switching the displayed DICOM
 * series in place. Visible only when the active volume came from a multi-series
 * import this session (the source + series list are retained in the store).
 * Picking a series re-assembles it from the retained files via `switchSeries`.
 */

import type { SeriesChoice } from '@prisma-mri/viewer-core';
import { ChevronDown, Layers } from 'lucide-react';
import {
  fillLabel,
  useViewer,
  useViewerFeatures,
  useViewerLabels,
  useViewerStore,
} from '../../viewer';
import styles from './StageSeriesSelect.module.css';

function optionLabel(s: SeriesChoice, slices: string): string {
  const bits = [s.label, s.orientation, fillLabel(slices, { count: s.count })].filter(Boolean);
  return bits.join(' · ');
}

/** The series the selector offers, or null when there is nothing to choose from. */
function useSeriesOnOffer(): SeriesChoice[] | null {
  const seriesList = useViewerStore((s) => s.seriesList);
  const { seriesSelect } = useViewerFeatures();
  return seriesSelect && seriesList && seriesList.length > 1 ? seriesList : null;
}

/**
 * Whether the selector is on screen. The findings panel sits in the same
 * corner, so it needs to know to put itself below.
 */
export function useSeriesSelectVisible(): boolean {
  return useSeriesOnOffer() !== null;
}

export function StageSeriesSelect() {
  const seriesList = useSeriesOnOffer();
  const activeSeriesKey = useViewerStore((s) => s.activeSeriesKey);
  const switching = useViewerStore((s) => s.switchingSeriesKey);
  const { switchSeries } = useViewer();
  const { series } = useViewerLabels();

  if (!seriesList) return null;

  return (
    <div className={styles.wrap}>
      <span className={styles.iconWrap} aria-hidden="true">
        <Layers size={15} />
      </span>
      <div className={styles.selectInner}>
        <select
          className={styles.select}
          aria-label={series.switchLabel}
          title={series.switchHint}
          // The pending choice while a series loads. Not `disabled` then: that
          // would drop the keyboard focus, and a second choice replaces the load.
          value={switching ?? activeSeriesKey ?? ''}
          aria-busy={switching !== null || undefined}
          onChange={(e) => switchSeries(e.target.value)}
        >
          {seriesList.map((s) => (
            <option key={s.key} value={s.key}>
              {optionLabel(s, series.slices)}
            </option>
          ))}
        </select>
        <ChevronDown className={styles.chevron} size={14} aria-hidden="true" />
      </div>
    </div>
  );
}
