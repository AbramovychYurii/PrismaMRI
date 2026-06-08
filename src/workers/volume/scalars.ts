import type { SliceWindowLevel, VoxelArray } from '@/types';

export interface ScalarHistogram {
  bins: Uint32Array;
  min: number;
  max: number;
  count: number;
}

/**
 * Optional sub-stage progress hook.  Called with a 0..1 ratio between chunks
 * so the caller can map it onto a slice of an outer progress range (e.g. the
 * `preparing-3d` import stage).  Kept off the hot path: the histogram loop
 * only invokes it at chunk boundaries, never per voxel.
 */
export type SubProgressFn = (ratio: number) => void;

// ~512K samples per progress tick — same heuristic the import adapters use.
const HIST_CHUNK = 1 << 19;

export function buildScalarHistogram(
  data: VoxelArray,
  binCount = 1024,
  ignore?: number,
  onProgress?: SubProgressFn,
): ScalarHistogram {
  // Int16 fast-path: fixed [-32768, 32767] range → single pass, no min/max pre-scan.
  if (data instanceof Int16Array) {
    const raw = new Uint32Array(65536);
    let count = 0;
    for (let off = 0; off < data.length; off += HIST_CHUNK) {
      const end = Math.min(off + HIST_CHUNK, data.length);
      for (let i = off; i < end; i++) {
        const v = data[i];
        if (ignore !== undefined && v === ignore) continue;
        raw[v + 32768]++;
        count++;
      }
      onProgress?.(end / data.length);
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

  // Generic two-pass path for Float32 and other types.  The two passes are
  // weighted 50/50 against the caller's progress range — pass 1 = min/max scan,
  // pass 2 = bin accumulation.
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let off = 0; off < data.length; off += HIST_CHUNK) {
    const end = Math.min(off + HIST_CHUNK, data.length);
    for (let i = off; i < end; i++) {
      const v = data[i];
      if (ignore !== undefined && v === ignore) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    onProgress?.((end / data.length) * 0.5);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { bins: new Uint32Array(1), min: min || 0, max: max || 1, count: 0 };
  }
  const bins = new Uint32Array(binCount);
  const scale = (binCount - 1) / (max - min);
  let count = 0;
  for (let off = 0; off < data.length; off += HIST_CHUNK) {
    const end = Math.min(off + HIST_CHUNK, data.length);
    for (let i = off; i < end; i++) {
      const v = data[i];
      if (ignore !== undefined && v === ignore) continue;
      bins[Math.round((v - min) * scale)]++;
      count++;
    }
    onProgress?.(0.5 + (end / data.length) * 0.5);
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
export function resolveScalarRange(h: ScalarHistogram, lo = 0.005, hi = 0.995): [number, number] {
  const [l, r] = batchPercentile(h, [lo, hi]);
  return [l, r];
}

/**
 * Otsu's single-threshold: returns the bin index that maximises between-class
 * variance. O(n) scan after the histogram is built.
 * For CT: separates air/background from tissue.
 * For MRI: separates background noise from signal.
 */
export function otsuBin(h: ScalarHistogram): number {
  const n = h.bins.length;
  const total = h.count;
  if (total === 0) return 0;

  let totalMean = 0;
  for (let i = 0; i < n; i++) totalMean += i * h.bins[i];

  let sumB = 0;
  let countB = 0;
  let bestVar = 0;
  let bestBin = 0;
  for (let i = 0; i < n; i++) {
    countB += h.bins[i];
    const countF = total - countB;
    if (countB === 0 || countF === 0) {
      sumB += i * h.bins[i];
      continue;
    }
    sumB += i * h.bins[i];
    const meanB = sumB / countB;
    const meanF = (totalMean - sumB) / countF;
    const between = (countB / total) * (countF / total) * (meanB - meanF) ** 2;
    if (between > bestVar) {
      bestVar = between;
      bestBin = i;
    }
  }
  return bestBin;
}

/**
 * Smart window/level for any modality:
 *
 * CT / HU data (h.min < −500):
 *   Lower bound fixed at −300 HU — just above the air/fat boundary,
 *   well below soft tissue (0–80 HU). Upper bound: 99.8th percentile.
 *   This reliably avoids the dominant air cluster without depending on
 *   the histogram shape.
 *
 * MRI / non-negative data:
 *   Otsu's method separates background noise from signal. The lower
 *   bound is set to the scalar value at the Otsu boundary; upper bound:
 *   99.8th percentile.
 */
export function resolveHistogramWindowLevel(h: ScalarHistogram): SliceWindowLevel {
  if (h.count === 0) return { window: 1, level: h.min };

  const [hi] = batchPercentile(h, [0.998]);
  let lo: number;

  if (h.min < -500) {
    // CT / HU: hard lower bound at -300 HU (above air, below soft tissue).
    lo = Math.max(h.min, -300);
  } else {
    // MRI / other: Otsu scalar value as the background/foreground boundary.
    const bin = otsuBin(h);
    const step = (h.max - h.min) / h.bins.length;
    lo = h.min + (bin + 1) * step;
  }

  if (lo >= hi) lo = h.min; // degenerate fallback
  const window = Math.max(1, hi - lo);
  return { window, level: lo + window / 2 };
}

/**
 * Iso-threshold for 3D raycast: blend of 95th and 99th percentiles mapped
 * to the texture's quantised [sourceRange lo..hi] space.
 * Returns a value in 0..1 where 0 = sourceRange lo, 1 = sourceRange hi.
 */
export function resolveIsoThreshold(h: ScalarHistogram, sourceRange?: [number, number]): number {
  if (h.count === 0) return 0.15;
  const [p95, p99] = batchPercentile(h, [0.95, 0.99]);
  const blended = p95 * 0.45 + p99 * 0.55;
  const [lo, hi] = sourceRange ?? [h.min, h.max];
  const t = (blended - lo) / (hi - lo || 1);
  return Math.min(0.95, Math.max(0.02, t));
}
