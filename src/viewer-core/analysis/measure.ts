import type { Axis, LoadedVolume, Vec3 } from '../types';
import { clampToDims } from '../volume/plane';
import { type Region, clampRegion, regionDims, round } from './grid';
import { autoClasses } from './thresholds';

export type RoiShape =
  | { kind: 'sphere'; center: Vec3; radiusMm: number }
  | { kind: 'box'; min: Vec3; max: Vec3 };

export interface RoiStats {
  voxels: number;
  volumeMm3: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  /** 5th, 25th, 50th, 75th, 95th percentile. */
  percentiles: [number, number, number, number, number];
  /** 12 equal bins between min and max. */
  histogram: { from: number; to: number; counts: number[] };
}

const MAX_ROI_SAMPLES = 2_000_000;

/** Intensity statistics inside a sphere (mm) or a box (voxels). */
export function roiStats(volume: LoadedVolume, shape: RoiShape): RoiStats {
  const { dims, spacing } = volume.meta;
  const [w, h] = dims;
  let region: Region;
  let inside: (x: number, y: number, z: number) => boolean;
  if (shape.kind === 'sphere') {
    const [cx, cy, cz] = shape.center;
    const rx = shape.radiusMm / spacing[0];
    const ry = shape.radiusMm / spacing[1];
    const rz = shape.radiusMm / spacing[2];
    region = clampRegion(
      {
        min: [cx - rx, cy - ry, cz - rz].map(Math.floor) as Vec3,
        max: [cx + rx, cy + ry, cz + rz].map(Math.ceil) as Vec3,
      },
      dims,
    );
    const r2 = shape.radiusMm ** 2;
    inside = (x, y, z) =>
      ((x - cx) * spacing[0]) ** 2 + ((y - cy) * spacing[1]) ** 2 + ((z - cz) * spacing[2]) ** 2 <=
      r2;
  } else {
    region = clampRegion({ min: shape.min, max: shape.max }, dims);
    inside = () => true;
  }
  const rd = regionDims(region);
  const total = rd[0] * rd[1] * rd[2];
  const step = Math.max(1, Math.ceil(total / MAX_ROI_SAMPLES));
  const values: number[] = [];
  let n = 0;
  for (let z = region.min[2]; z <= region.max[2]; z++) {
    for (let y = region.min[1]; y <= region.max[1]; y++) {
      for (let x = region.min[0]; x <= region.max[0]; x++) {
        if (!inside(x, y, z)) continue;
        n++;
        if (n % step === 0) values.push(volume.voxels[x + y * w + z * w * h]);
      }
    }
  }
  if (values.length === 0) {
    return {
      voxels: 0,
      volumeMm3: 0,
      mean: Number.NaN,
      sd: Number.NaN,
      min: Number.NaN,
      max: Number.NaN,
      percentiles: [Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN],
      histogram: { from: 0, to: 0, counts: [] },
    };
  }
  const sorted = Float64Array.from(values).sort();
  let sum = 0;
  for (const v of sorted) sum += v;
  const mean = sum / sorted.length;
  let sq = 0;
  for (const v of sorted) sq += (v - mean) ** 2;
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const counts = new Array<number>(12).fill(0);
  const span = hi - lo || 1;
  for (const v of sorted) counts[Math.min(11, Math.floor(((v - lo) / span) * 12))]++;
  return {
    voxels: n,
    volumeMm3: n * spacing[0] * spacing[1] * spacing[2],
    mean,
    sd: Math.sqrt(sq / sorted.length),
    min: lo,
    max: hi,
    percentiles: [at(0.05), at(0.25), at(0.5), at(0.75), at(0.95)],
    histogram: { from: lo, to: hi, counts },
  };
}

export function roundRoi(s: RoiStats) {
  return {
    voxels: s.voxels,
    volumeMm3: round(s.volumeMm3, 1),
    mean: round(s.mean, 1),
    sd: round(s.sd, 1),
    min: round(s.min, 1),
    max: round(s.max, 1),
    percentiles: s.percentiles.map((v) => round(v, 1)),
    histogram: {
      from: round(s.histogram.from, 1),
      to: round(s.histogram.to, 1),
      counts: s.histogram.counts,
    },
  };
}

/** Trilinear sample at a fractional voxel position; outside the volume reads as the minimum. */
export function sampleAt(volume: LoadedVolume, x: number, y: number, z: number): number {
  const { dims } = volume.meta;
  if (x < 0 || y < 0 || z < 0 || x > dims[0] - 1 || y > dims[1] - 1 || z > dims[2] - 1) {
    return volume.scalarMin;
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = Math.min(dims[0] - 1, x0 + 1);
  const y1 = Math.min(dims[1] - 1, y0 + 1);
  const z1 = Math.min(dims[2] - 1, z0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const [w, h] = dims;
  const v = volume.voxels;
  const at = (i: number, j: number, k: number) => v[i + j * w + k * w * h];
  const c00 = at(x0, y0, z0) * (1 - fx) + at(x1, y0, z0) * fx;
  const c10 = at(x0, y1, z0) * (1 - fx) + at(x1, y1, z0) * fx;
  const c01 = at(x0, y0, z1) * (1 - fx) + at(x1, y0, z1) * fx;
  const c11 = at(x0, y1, z1) * (1 - fx) + at(x1, y1, z1) * fx;
  return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
}

export interface LineProfile {
  lengthMm: number;
  stepMm: number;
  values: number[];
  min: { value: number; atMm: number };
  max: { value: number; atMm: number };
  /** Distance of the steepest rise or fall along the line — an edge. */
  steepestEdgeAtMm: number;
}

/** Intensities along a straight line between two voxels. */
export function lineProfile(volume: LoadedVolume, from: Vec3, to: Vec3, samples = 64): LineProfile {
  const { dims, spacing } = volume.meta;
  const a = clampToDims({ x: from[0], y: from[1], z: from[2] }, dims);
  const b = clampToDims({ x: to[0], y: to[1], z: to[2] }, dims);
  const lengthMm = Math.hypot(
    (b.x - a.x) * spacing[0],
    (b.y - a.y) * spacing[1],
    (b.z - a.z) * spacing[2],
  );
  const n = Math.max(2, Math.min(256, Math.round(samples)));
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    values.push(
      sampleAt(volume, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t),
    );
  }
  const stepMm = lengthMm / (n - 1);
  let iMin = 0;
  let iMax = 0;
  let iEdge = 0;
  let steepest = -1;
  values.forEach((v, i) => {
    if (v < values[iMin]) iMin = i;
    if (v > values[iMax]) iMax = i;
    if (i > 0 && Math.abs(v - values[i - 1]) > steepest) {
      steepest = Math.abs(v - values[i - 1]);
      iEdge = i - 0.5;
    }
  });
  return {
    lengthMm,
    stepMm,
    values,
    min: { value: values[iMin], atMm: iMin * stepMm },
    max: { value: values[iMax], atMm: iMax * stepMm },
    steepestEdgeAtMm: iEdge * stepMm,
  };
}

export function roundLineProfile(p: LineProfile) {
  return {
    lengthMm: round(p.lengthMm, 2),
    stepMm: round(p.stepMm, 3),
    values: p.values.map((v) => round(v, 1)),
    min: p.min,
    max: p.max,
    steepestEdgeAtMm: round(p.steepestEdgeAtMm, 2),
  };
}

export type CurveMetric = 'mean' | 'area_above' | 'max';

export interface SliceCurve {
  axis: Axis;
  metric: CurveMetric;
  threshold?: number;
  /** Per slice (0-based along the axis), then block-averaged to ≤ `maxPoints`. */
  values: number[];
  /** Slices per value after averaging. */
  slicesPerValue: number;
  peaks: { slice: number; value: number }[];
}

/** One number per slice along an axis: where along the volume does something happen? */
export function sliceCurve(
  volume: LoadedVolume,
  axis: Axis,
  metric: CurveMetric,
  options: { threshold?: number; maxPoints?: number } = {},
): SliceCurve {
  const { dims, spacing } = volume.meta;
  const [w, h, d] = dims;
  const a = 'xyz'.indexOf(axis);
  const n = dims[a];
  const sums = new Float64Array(n);
  const peaksV = new Float64Array(n).fill(Number.NEGATIVE_INFINITY);
  const threshold = options.threshold ?? (metric === 'area_above' ? autoClasses(volume)[0] : 0);
  const v = volume.voxels;
  for (let z = 0; z < d; z++) {
    for (let y = 0; y < h; y++) {
      const row = y * w + z * w * h;
      for (let x = 0; x < w; x++) {
        const val = v[row + x];
        const s = a === 0 ? x : a === 1 ? y : z;
        if (metric === 'mean') sums[s] += val;
        else if (metric === 'area_above') {
          if (val >= threshold) sums[s]++;
        } else if (val > peaksV[s]) peaksV[s] = val;
      }
    }
  }
  const others = [0, 1, 2].filter((i) => i !== a);
  const slicePixels = dims[others[0]] * dims[others[1]];
  const pixelArea = spacing[others[0]] * spacing[others[1]];
  const raw: number[] = [];
  for (let s = 0; s < n; s++) {
    raw.push(
      metric === 'mean'
        ? sums[s] / slicePixels
        : metric === 'area_above'
          ? sums[s] * pixelArea
          : peaksV[s],
    );
  }
  const maxPoints = Math.max(8, options.maxPoints ?? 200);
  const per = Math.max(1, Math.ceil(n / maxPoints));
  const values: number[] = [];
  for (let s = 0; s < n; s += per) {
    let sum = 0;
    let c = 0;
    for (let t = s; t < Math.min(n, s + per); t++) {
      sum += raw[t];
      c++;
    }
    values.push(round(sum / c, 1));
  }
  const ranked = values
    .map((value, i) => ({ slice: i * per, value }))
    .sort((p, q) => q.value - p.value);
  const peaks: { slice: number; value: number }[] = [];
  for (const cand of ranked) {
    if (peaks.length >= 3) break;
    if (peaks.every((p) => Math.abs(p.slice - cand.slice) > 3 * per)) peaks.push(cand);
  }
  return {
    axis,
    metric,
    threshold: metric === 'area_above' ? round(threshold, 1) : undefined,
    values,
    slicesPerValue: per,
    peaks,
  };
}
