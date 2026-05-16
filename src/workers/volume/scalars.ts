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

/** Value at the given cumulative percentile (0..1) of the histogram. */
export function percentile(h: ScalarHistogram, p: number): number {
  if (h.count === 0) return h.min;
  const target = p * h.count;
  let acc = 0;
  const step = (h.max - h.min) / h.bins.length;
  for (let i = 0; i < h.bins.length; i++) {
    acc += h.bins[i];
    if (acc >= target) return h.min + i * step;
  }
  return h.max;
}

/**
 * Robust scalar range, trimming outliers via the 0.5th / 99.5th percentiles.
 */
export function resolveScalarRange(
  h: ScalarHistogram,
  lo = 0.005,
  hi = 0.995,
): [number, number] {
  return [percentile(h, lo), percentile(h, hi)];
}

/**
 * Histogram-percentile window/level (5th..99.9th). Far more robust than
 * raw min/max for CBCT/CT where a few extreme voxels skew the range.
 */
export function resolveHistogramWindowLevel(h: ScalarHistogram): SliceWindowLevel {
  const lo = percentile(h, 0.05);
  const hi = percentile(h, 0.999);
  const window = Math.max(1, hi - lo);
  return { window, level: lo + window / 2 };
}

/** Iso-threshold for 3D raycast: blend of 95th and 99th percentiles, 0..1. */
export function resolveIsoThreshold(h: ScalarHistogram): number {
  if (h.count === 0) return 0.15;
  const p95 = percentile(h, 0.95);
  const p99 = percentile(h, 0.99);
  const blended = p95 * 0.45 + p99 * 0.55;
  const t = (blended - h.min) / (h.max - h.min || 1);
  return Math.min(0.95, Math.max(0.02, t));
}
