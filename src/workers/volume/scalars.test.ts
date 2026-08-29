import type { VoxelArray } from '@/types';
import {
  type ScalarHistogram,
  batchPercentile,
  buildScalarHistogram,
  otsuBin,
  percentile,
  resolveHistogramWindowLevel,
  resolveIsoThreshold,
  resolveScalarRange,
} from '@/workers/volume/scalars';
import { describe, expect, it } from 'vitest';

/** Values 0..n-1 repeated, so the distribution is exactly uniform. */
function ramp(kind: 'f32' | 'i16', values: number[]): VoxelArray {
  return kind === 'i16' ? Int16Array.from(values) : Float32Array.from(values);
}

const uniform0to999 = Array.from({ length: 1000 }, (_, i) => i);

describe('buildScalarHistogram', () => {
  it('finds the true range and counts every sample', () => {
    for (const kind of ['f32', 'i16'] as const) {
      const h = buildScalarHistogram(ramp(kind, uniform0to999), 256);
      expect(h.min).toBe(0);
      expect(h.max).toBe(999);
      expect(h.count).toBe(1000);
      // Every sample must land in exactly one bin.
      expect(h.bins.reduce((a, b) => a + b, 0)).toBe(1000);
    }
  });

  it('gives the Int16 fast path and the generic path the same answer', () => {
    // Int16 gets a single-pass 65536-bucket shortcut; Float32 takes a two-pass
    // min/max scan. They must not diverge.
    const values = [-1024, -500, 0, 1, 2, 300, 4095];
    const viaFast = buildScalarHistogram(ramp('i16', values), 64);
    const viaGeneric = buildScalarHistogram(ramp('f32', values), 64);
    expect(viaFast.min).toBe(viaGeneric.min);
    expect(viaFast.max).toBe(viaGeneric.max);
    expect(viaFast.count).toBe(viaGeneric.count);
    expect(Array.from(viaFast.bins)).toEqual(Array.from(viaGeneric.bins));
  });

  it('skips the ignored sentinel value', () => {
    const values = [-32768, -32768, 10, 20, 30];
    for (const kind of ['f32', 'i16'] as const) {
      const h = buildScalarHistogram(ramp(kind, values), 32, -32768);
      expect(h.count).toBe(3);
      expect(h.min).toBe(10);
      expect(h.max).toBe(30);
    }
  });

  it('survives a flat volume without dividing by zero', () => {
    for (const kind of ['f32', 'i16'] as const) {
      const h = buildScalarHistogram(ramp(kind, [7, 7, 7, 7]), 64);
      expect(h.min).toBe(7);
      expect(h.max).toBe(7);
      expect(Number.isFinite(h.min)).toBe(true);
      expect(percentile(h, 0.5)).toBe(7);
    }
  });

  it('reports monotonic progress ending at 1', () => {
    const seen: number[] = [];
    buildScalarHistogram(ramp('f32', uniform0to999), 64, undefined, (r) => seen.push(r));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBeCloseTo(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });
});

describe('batchPercentile', () => {
  const h = buildScalarHistogram(ramp('f32', uniform0to999), 1000);

  it('approximates the quantiles of a uniform distribution', () => {
    const [p10, p50, p90] = batchPercentile(h, [0.1, 0.5, 0.9]);
    expect(p10).toBeCloseTo(100, -1);
    expect(p50).toBeCloseTo(500, -1);
    expect(p90).toBeCloseTo(900, -1);
  });

  it('returns results in the order asked, not in sorted order', () => {
    // The implementation sorts internally and maps back by index — an easy
    // place to scramble results.
    const ascending = batchPercentile(h, [0.1, 0.5, 0.9]);
    const descending = batchPercentile(h, [0.9, 0.5, 0.1]);
    expect(descending).toEqual([...ascending].reverse());
  });

  it('handles duplicate and edge percentiles', () => {
    const [a, b] = batchPercentile(h, [0.5, 0.5]);
    expect(a).toBe(b);
    expect(batchPercentile(h, [0])[0]).toBeLessThanOrEqual(h.min + 1);
    expect(batchPercentile(h, [1])[0]).toBeCloseTo(h.max, -1);
  });

  it('is monotonically non-decreasing in p', () => {
    const ps = [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1];
    const out = batchPercentile(h, ps);
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1]);
  });

  it('falls back to min for an empty histogram', () => {
    const empty: ScalarHistogram = { bins: new Uint32Array(1), min: 5, max: 9, count: 0 };
    expect(batchPercentile(empty, [0.5, 0.9])).toEqual([5, 5]);
  });
});

describe('resolveScalarRange', () => {
  it('trims the extreme tails', () => {
    // One wild outlier must not stretch the range it returns.
    const values = [...Array.from({ length: 999 }, () => 100), 100000];
    const h = buildScalarHistogram(ramp('f32', values), 512);
    const [lo, hi] = resolveScalarRange(h);
    expect(hi).toBeLessThan(100000);
    expect(lo).toBeGreaterThanOrEqual(h.min);
  });
});

describe('otsuBin', () => {
  it('lands between two well-separated modes', () => {
    // 400 samples near 10, 400 near 240 — the split belongs in the empty middle.
    const values = [
      ...Array.from({ length: 400 }, (_, i) => 10 + (i % 5)),
      ...Array.from({ length: 400 }, (_, i) => 240 + (i % 5)),
    ];
    const h = buildScalarHistogram(ramp('f32', values), 256);
    const step = (h.max - h.min) / h.bins.length;
    // Same convention as resolveHistogramWindowLevel: the boundary sits at the
    // top edge of the chosen bin, so the whole low cluster falls below it.
    const boundary = h.min + (otsuBin(h) + 1) * step;
    expect(boundary).toBeGreaterThan(14); // above every low-mode sample
    expect(boundary).toBeLessThan(240); // below every high-mode sample
  });

  it('returns 0 for an empty histogram', () => {
    expect(otsuBin({ bins: new Uint32Array(4), min: 0, max: 1, count: 0 })).toBe(0);
  });
});

describe('resolveHistogramWindowLevel', () => {
  it('pins CT data just above the air cluster', () => {
    // Mostly air at -1000 HU with soft tissue around 40 — the window must not
    // be dragged down into the air, or everything renders washed out.
    const values = [
      ...Array.from({ length: 800 }, () => -1000),
      ...Array.from({ length: 200 }, (_, i) => 20 + (i % 60)),
    ];
    const h = buildScalarHistogram(ramp('f32', values), 1024);
    const { window, level } = resolveHistogramWindowLevel(h);
    const lower = level - window / 2;
    expect(lower).toBeCloseTo(-300, 0);
    expect(window).toBeGreaterThan(0);
  });

  it('uses Otsu for non-negative MRI-like data', () => {
    // Background noise near 0, signal near 500. The lower bound should sit
    // above the noise, not at zero.
    const values = [
      ...Array.from({ length: 700 }, (_, i) => i % 12),
      ...Array.from({ length: 300 }, (_, i) => 480 + (i % 40)),
    ];
    const h = buildScalarHistogram(ramp('f32', values), 1024);
    const { window, level } = resolveHistogramWindowLevel(h);
    const lower = level - window / 2;
    // Above the loudest noise sample (11) and below the quietest signal (480).
    expect(lower).toBeGreaterThan(11);
    expect(lower).toBeLessThan(480);
  });

  it('never returns a zero or negative window', () => {
    for (const values of [[7, 7, 7], [0], uniform0to999]) {
      const h = buildScalarHistogram(ramp('f32', values), 256);
      expect(resolveHistogramWindowLevel(h).window).toBeGreaterThan(0);
    }
  });
});

describe('resolveIsoThreshold', () => {
  it('stays inside the shader-safe 0.02..0.95 band', () => {
    for (const values of [uniform0to999, [7, 7, 7], [0, 1000]]) {
      const h = buildScalarHistogram(ramp('f32', values), 256);
      const t = resolveIsoThreshold(h, [h.min, h.max]);
      expect(t).toBeGreaterThanOrEqual(0.02);
      expect(t).toBeLessThanOrEqual(0.95);
    }
  });

  it('is expressed in the quantised texture range, not raw scalars', () => {
    const h = buildScalarHistogram(ramp('f32', uniform0to999), 256);
    // Doubling the range the texture was quantised over halves the threshold.
    const narrow = resolveIsoThreshold(h, [0, 1000]);
    const wide = resolveIsoThreshold(h, [0, 2000]);
    expect(wide).toBeLessThan(narrow);
  });
});
