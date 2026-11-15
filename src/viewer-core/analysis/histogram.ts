import type { LoadedVolume } from '../types';

interface IntensityHistogram {
  min: number;
  max: number;
  binWidth: number;
  bins: Uint32Array;
  total: number;
}

/** Linear histogram over the volume's range, sampling at most `maxSamples` voxels. */
export function intensityHistogram(
  volume: LoadedVolume,
  nBins = 2048,
  maxSamples = 8_000_000,
): IntensityHistogram {
  const { voxels } = volume;
  const min = volume.scalarMin;
  const max = Math.max(volume.scalarMax, min + 1e-6);
  const binWidth = (max - min) / nBins;
  const bins = new Uint32Array(nBins);
  const step = Math.max(1, Math.floor(voxels.length / maxSamples));
  let total = 0;
  for (let i = 0; i < voxels.length; i += step) {
    let b = Math.floor((voxels[i] - min) / binWidth);
    if (b < 0) b = 0;
    else if (b >= nBins) b = nBins - 1;
    bins[b]++;
    total++;
  }
  return { min, max, binWidth, bins, total };
}

/** Intensity below which `fraction` of the sampled voxels lie. */
export function percentileOf(hist: IntensityHistogram, fraction: number): number {
  const target = fraction * hist.total;
  let acc = 0;
  for (let b = 0; b < hist.bins.length; b++) {
    acc += hist.bins[b];
    if (acc >= target) return hist.min + (b + 1) * hist.binWidth;
  }
  return hist.max;
}

/**
 * Three-class Otsu thresholds (air | soft | dense) on the histogram clipped to
 * its 0.05–99.95 % range, so a few metal voxels cannot stretch the scale.
 */
export function otsuThresholds(hist: IntensityHistogram): [number, number] {
  const lo = percentileOf(hist, 0.0005);
  const hi = Math.max(percentileOf(hist, 0.9995), lo + hist.binWidth);
  const N = 128;
  const counts = new Float64Array(N);
  const width = (hi - lo) / N;
  for (let b = 0; b < hist.bins.length; b++) {
    const centre = hist.min + (b + 0.5) * hist.binWidth;
    if (centre < lo || centre > hi) continue;
    counts[Math.min(N - 1, Math.floor((centre - lo) / width))] += hist.bins[b];
  }
  const total = counts.reduce((s, c) => s + c, 0);
  if (total === 0) return [lo, lo];
  // Prefix sums of probability and of mean·probability.
  const P = new Float64Array(N + 1);
  const S = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) {
    P[i + 1] = P[i] + counts[i] / total;
    S[i + 1] = S[i] + ((i + 0.5) * counts[i]) / total;
  }
  const mu = S[N];
  const between = (a: number, b: number): number => {
    const w = P[b] - P[a];
    if (w <= 1e-12) return 0;
    const m = (S[b] - S[a]) / w;
    return w * (m - mu) * (m - mu);
  };
  // Equal scores are common when the histogram has gaps (clean images, phantoms):
  // take the middle of the plateau so the threshold sits in the gap, not on its edge.
  const EPS = 1e-9;
  let bestScore = -1;
  let bestPairs: [number, number][] = [];
  for (let a = 1; a < N - 1; a++) {
    for (let b = a + 1; b < N; b++) {
      const score = between(0, a) + between(a, b) + between(b, N);
      if (score > bestScore + EPS) {
        bestScore = score;
        bestPairs = [[a, b]];
      } else if (Math.abs(score - bestScore) <= EPS) bestPairs.push([a, b]);
    }
  }
  const mean = (i: 0 | 1) => bestPairs.reduce((s, pair) => s + pair[i], 0) / bestPairs.length;
  return [lo + mean(0) * width, lo + mean(1) * width];
}
