/** Commands for a study that holds several series: list them and switch between them. */

import type { SeriesChoice } from '@prisma-mri/viewer-core';
import type { Handler } from './handler-base';

const NO_OTHER_SERIES =
  'a single series, or it was reopened from the browser cache, which had no room for the rest of its study';

/** Picks a series by 1-based position, by key, or by its label (when unambiguous). */
function findSeries(list: SeriesChoice[], raw: unknown): SeriesChoice | undefined {
  if (typeof raw === 'number') return list[Math.round(raw) - 1];
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  const byKey = list.find((s) => s.key === text);
  if (byKey) return byKey;
  const byLabel = list.filter((s) => s.label.toLowerCase() === text.toLowerCase());
  if (byLabel.length === 1) return byLabel[0];
  if (/^\d+$/.test(text)) return list[Number(text) - 1];
  return undefined;
}

const handleListSeries: Handler = ({ ok, viewer }) => {
  const snapshot = viewer.getSnapshot();
  const list = snapshot.seriesList;
  if (!list) {
    ok({
      count: 0,
      active: null,
      series: [],
      note: `This volume has ${NO_OTHER_SERIES}.`,
    });
    return;
  }

  const elsewhere = new Map<string, number>();
  for (const a of snapshot.otherSeriesAnnotations) {
    if (a.seriesKey) elsewhere.set(a.seriesKey, (elsewhere.get(a.seriesKey) ?? 0) + 1);
  }
  ok({
    count: list.length,
    active: snapshot.activeSeriesKey,
    series: list.map((s, i) => ({
      index: i + 1,
      key: s.key,
      label: s.label,
      orientation: s.orientation ?? null,
      modality: s.modality ?? null,
      slices: s.count,
      matrix: [s.columns, s.rows],
      active: s.key === snapshot.activeSeriesKey,
      findings:
        s.key === snapshot.activeSeriesKey
          ? snapshot.annotations.length
          : (elsewhere.get(s.key) ?? 0),
    })),
    note: 'Findings are counted for the series on screen and those shown earlier in this session.',
  });
};

const handleSwitchSeries: Handler = async ({ msg, ok, fail, viewer }) => {
  const list = viewer.getSnapshot().seriesList;
  if (!list) {
    fail(`There is no other series to switch to: this volume has ${NO_OTHER_SERIES}.`);
    return;
  }
  const target = findSeries(list, msg.series);
  if (!target) {
    fail(
      `No such series. Give "series" as a position or a name, one of: ${list
        .map((s, i) => `${i + 1} = ${s.label}`)
        .join('; ')}.`,
    );
    return;
  }

  await viewer.switchSeries(target.key);

  const after = viewer.getSnapshot();
  if (after.activeSeriesKey !== target.key || !after.volume) {
    fail(after.error ?? `Could not switch to "${target.label}".`);
    return;
  }
  const { dims, spacing, modality } = after.volume.meta;
  ok({
    active: target.key,
    label: target.label,
    orientation: target.orientation ?? null,
    dims,
    spacing,
    modality,
    findings: after.annotations.length,
    note: 'The crosshair, window/level and 3-D preset are back at this series’ defaults.',
  });
};

export const SERIES_HANDLERS: Record<string, Handler> = {
  list_series: handleListSeries,
  switch_series: handleSwitchSeries,
};
