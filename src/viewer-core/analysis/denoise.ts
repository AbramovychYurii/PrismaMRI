import type { LoadedVolume } from '../types';
import { type Region, clampRegion, forEachLine, fullRegion, regionDims } from './grid';

/**
 * Noise level, from the median absolute difference of neighbouring voxels —
 * robust to edges because they are a small share of the pairs.
 */
export function estimateNoiseSd(volume: LoadedVolume, samples = 200_000): number {
  const { voxels } = volume;
  const { dims } = volume.meta;
  const [w] = dims;
  const step = Math.max(1, Math.floor(voxels.length / samples));
  const diffs: number[] = [];
  for (let i = 0; i + 1 < voxels.length; i += step) {
    if ((i + 1) % w === 0) continue;
    diffs.push(Math.abs(voxels[i + 1] - voxels[i]));
  }
  if (diffs.length === 0) return 0;
  diffs.sort((a, b) => a - b);
  const median = diffs[diffs.length >> 1];
  // For Gaussian noise, median |x₁−x₂| = 0.6745·√2·σ.
  return median / (0.6745 * Math.SQRT2);
}

/** A 3×3×3 mean of a box of the volume, as a volume of its own (float). */
export function boxSmooth(volume: LoadedVolume, region?: Region): LoadedVolume {
  const { dims, spacing } = volume.meta;
  const r = clampRegion(region ?? fullRegion(dims), dims);
  const rd = regionDims(r);
  const [w, h] = dims;
  let cur = new Float32Array(rd[0] * rd[1] * rd[2]);
  for (let z = 0; z < rd[2]; z++) {
    for (let y = 0; y < rd[1]; y++) {
      const src = r.min[0] + (r.min[1] + y) * w + (r.min[2] + z) * w * h;
      const dst = y * rd[0] + z * rd[0] * rd[1];
      for (let x = 0; x < rd[0]; x++) cur[dst + x] = volume.voxels[src + x];
    }
  }
  for (let axis = 0; axis < 3; axis++) {
    const from = cur;
    const next = new Float32Array(from.length);
    forEachLine(rd, axis, (base, stride, n) => {
      for (let i = 0; i < n; i++) {
        const lo = i > 0 ? i - 1 : i;
        const hi = i < n - 1 ? i + 1 : i;
        next[base + i * stride] =
          (from[base + lo * stride] + from[base + i * stride] + from[base + hi * stride]) / 3;
      }
    });
    cur = next;
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of cur) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return {
    voxels: cur,
    meta: { ...volume.meta, dims: rd, spacing },
    scalarMin: min,
    scalarMax: max,
    windowLevel: volume.windowLevel,
    formatId: volume.formatId,
  };
}
