import type { ImportProgress, ImportStage } from '@/types';

const STAGE_WEIGHT: Record<ImportStage, [start: number, end: number]> = {
  idle: [0, 0],
  scanning: [0, 5],
  'parsing-headers': [5, 15],
  'reading-files': [15, 70],
  assembling: [70, 88],
  'preparing-3d': [88, 99],
  done: [100, 100],
  error: [0, 0],
};

/** Map a stage + intra-stage ratio to an overall 0..100 percent. */
export function progressPercent(p: ImportProgress): number {
  const [start, end] = STAGE_WEIGHT[p.stage] ?? [0, 0];
  const ratio = p.total > 0 ? Math.min(1, p.current / p.total) : 0;
  return Math.round(start + (end - start) * ratio);
}
