import type { SeriesChoice } from './types';

/** Label of the series with `key`, when `list` has it. */
export function seriesLabel(
  list: readonly SeriesChoice[] | null | undefined,
  key: string | null | undefined,
): string | undefined {
  return list?.find((s) => s.key === key)?.label;
}
