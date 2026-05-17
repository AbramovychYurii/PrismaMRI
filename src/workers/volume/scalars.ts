import type { SliceWindowLevel, VoxelArray } from '@/types';

export interface ScalarHistogram {
  bins: Uint32Array;
  min: number;
  max: number;
  count: number;
}

export function buildScalarHistogram(
  data: VoxelArray,
  binCount = 1024,
  ignore?: number,
): ScalarHistogram {
  // Int16 fast-path: fixed [-32768, 32767] range → single pass, no min/max pre-scan.
  if (data instanceof Int16Array) {
    const raw = new Uint32Array(65536);
    let count = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (ignore !== undefined && v === ignore) continue;
      raw[v + 32768]++;
      count++;
    }
    if (count === 0) return { bins: new Uint32Array(1), min: 0, max: 1, count: 0 };

    // Derive min/max from non-zero bins.
    let minIdx = 0;
    while (minIdx < 65536 && raw[minIdx] === 0) minIdx++;
    let maxIdx = 65535;
    while (maxIdx > minIdx && raw[maxIdx] === 0) maxIdx--;
    const min = minIdx - 32768;
    const max = maxIdx - 32768;

    if (min === max) {
      const bins = new Uint32Array(1);
      bins[0] = count;
      return { bins, min, max, count };
    }

    // Re-bucket into `binCount` bins.
    const bins = new Uint32Array(binCount);
    const scale = (binCount - 1) / (max - min);
    for (let i = minIdx; i <= maxIdx; i++) {
      if (raw[i] === 0) continue;
      bins[Math.round((i - minIdx) * scale)] += raw[i];
    }
    return { bins, min, max, count };
  }

  // Generic two-pass path for Float32 and other types.
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (ignore !== undefined && v === ignore) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { bins: new Uint32Array(1), min: min || 0, max: max || 1, count: 0 };
  }
  const bins = new Uint32Array(binCount);
  const scale = (binCount - 1) / (max - min);
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (ignore !== undefined && v === ignore) continue;
    bins[Math.round((v - min) * scale)]++;
    count++;
  }
  return { bins, min, max, count };
}

/**
 * Compute multiple percentiles in a single CDF scan.
 * `ps` values are 0..1 and need not be sorted.
 */
export function batchPercentile(h: ScalarHistogram, ps: number[]): number[] {
  if (h.count === 0) return ps.map(() => h.min);
  const sorted = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const results = new Array<number>(ps.length);
  const step = (h.max - h.min) / h.bins.length;
  let acc = 0;
  let si = 0;
  for (let bi = 0; bi < h.bins.length && si < sorted.length; bi++) {
    acc += h.bins[bi];
    const val = h.min + bi * step;
    while (si < sorted.length && acc >= sorted[si].p * h.count) {
      results[sorted[si].i] = val;
      si++;
    }
  }
  while (si < sorted.length) {
    results[sorted[si].i] = h.max;
    si++;
  }
  return results;
}

/** Value at the given cumulative percentile (0..1) of the histogram. */
export function percentile(h: ScalarHistogram, p: number): number {
  return batchPercentile(h, [p])[0];
}

/**
 * Robust scalar range, trimming outliers via the 0.5th / 99.5th percentiles.
 */
export function resolveScalarRange(
  h: ScalarHistogram,
  lo = 0.005,
  hi = 0.995,
): [number, number] {
  const [l, r] = batchPercentile(h, [lo, hi]);
  return [l, r];
}

/**
 * Histogram-percentile window/level (5th..99.9th). Far more robust than
 * raw min/max for CBCT/CT where a few extreme voxels skew the range.
 */
export function resolveHistogramWindowLevel(h: ScalarHistogram): SliceWindowLevel {
  const [lo, hi] = batchPercentile(h, [0.05, 0.999]);
  const window = Math.max(1, hi - lo);
  return { window, level: lo + window / 2 };
}

/** Iso-threshold for 3D raycast: blend of 95th and 99th percentiles, 0..1. */
export function resolveIsoThreshold(h: ScalarHistogram): number {
  if (h.count === 0) return 0.15;
  const [p95, p99] = batchPercentile(h, [0.95, 0.99]);
  const blended = p95 * 0.45 + p99 * 0.55;
  const t = (blended - h.min) / (h.max - h.min || 1);
  return Math.min(0.95, Math.max(0.02, t));
}
