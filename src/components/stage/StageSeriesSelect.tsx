/**
 * StageSeriesSelect — top-left stage control for switching the displayed DICOM
 * series in place. Visible only when the active volume came from a multi-series
 * import this session (the source + series list are retained in the store).
 * Picking a series re-assembles it from the retained files via `switchSeries`.
 */

import { useViewerActions } from '@/hooks';
import type { SeriesChoice } from '@/lib/import/types';
import { useVolumeStore } from '@/store';
import { ChevronDown, Layers } from 'lucide-react';
import styled from 'styled-components';

const Wrap = styled.div`
  position: absolute;
  top: 22px;
  left: 30px;
  z-index: var(--z-panel-chrome);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 12px;
  height: 44px;
  background: rgba(20, 18, 14, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid var(--rule);
  border-radius: 999px;
  color: var(--ink-2);
  transition: 120ms;

  &:hover {
    background: rgba(28, 24, 18, 0.92);
    border-color: var(--amber-dim);
    color: var(--ink);
  }

  @media (max-width: 767px) {
    top: 12px;
    left: 12px;
    height: 40px;
  }
`;

const IconWrap = styled.span`
  display: inline-flex;
  color: var(--amber);
  pointer-events: none;
`;

const SelectInner = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;
`;

const Select = styled.select`
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: none;
  outline: none;
  color: inherit;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0 20px 0 0;
  max-width: 230px;
  cursor: pointer;

  /* Native option list is light-on-dark on most platforms; force readable. */
  option {
    background: #14120e;
    color: var(--ink);
    text-transform: none;
    letter-spacing: normal;
  }

  &:focus-visible {
    color: var(--ink);
  }
`;

const Chevron = styled(ChevronDown)`
  position: absolute;
  right: 0;
  pointer-events: none;
  color: var(--ink-3);
`;

function optionLabel(s: SeriesChoice): string {
  const bits = [s.label, s.orientation, `${s.count} sl`].filter(Boolean);
  return bits.join(' · ');
}

export function StageSeriesSelect() {
  const seriesList = useVolumeStore((s) => s.seriesList);
  const activeSeriesKey = useVolumeStore((s) => s.activeSeriesKey);
  const loading = useVolumeStore((s) => s.loading.active);
  const { switchSeries } = useViewerActions();

  if (!seriesList || seriesList.length <= 1) return null;

  return (
    <Wrap>
      <IconWrap aria-hidden="true">
        <Layers size={15} />
      </IconWrap>
      <SelectInner>
        <Select
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
        </Select>
        <Chevron size={14} aria-hidden="true" />
      </SelectInner>
    </Wrap>
  );
}
