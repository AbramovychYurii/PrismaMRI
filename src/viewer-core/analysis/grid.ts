import type { LoadedVolume, Vec3 } from '../types';

/** An inclusive box of source voxels. */
export interface Region {
  min: Vec3;
  max: Vec3;
}

/**
 * A binary mask on a grid that may be coarser than the source volume: one mask
 * voxel stands for `stride`³ source voxels. Analysis works on masks so a large
 * study never needs more memory than `maxVoxels` bytes per working array.
 */
export interface Mask3 {
  data: Uint8Array;
  dims: Vec3;
  /** Millimetres per mask voxel. */
  spacing: Vec3;
  /** Source voxels per mask voxel, per axis. */
  stride: number;
  /** Source voxel where mask voxel (0,0,0) starts. */
  offset: Vec3;
  /** Foreground voxel count. */
  count: number;
}

/** Default cap on the voxels one analysis works on. */
const DEFAULT_MAX_VOXELS = 24_000_000;

export const round = (value: number, digits = 1): number => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

export const roundTriple = (v: ArrayLike<number>, digits = 1): Vec3 => [
  round(v[0], digits),
  round(v[1], digits),
  round(v[2], digits),
];

export function fullRegion(dims: ArrayLike<number>): Region {
  return { min: [0, 0, 0], max: [dims[0] - 1, dims[1] - 1, dims[2] - 1] };
}

export function clampRegion(region: Region, dims: ArrayLike<number>): Region {
  const lo = (v: number, d: number) => Math.min(d - 1, Math.max(0, Math.round(v)));
  return {
    min: [lo(region.min[0], dims[0]), lo(region.min[1], dims[1]), lo(region.min[2], dims[2])],
    max: [lo(region.max[0], dims[0]), lo(region.max[1], dims[1]), lo(region.max[2], dims[2])],
  };
}

export function regionDims(region: Region): Vec3 {
  return [
    region.max[0] - region.min[0] + 1,
    region.max[1] - region.min[1] + 1,
    region.max[2] - region.min[2] + 1,
  ];
}

/** Smallest integer stride that brings a region under `maxVoxels`. */
function strideFor(dims: ArrayLike<number>, maxVoxels = DEFAULT_MAX_VOXELS): number {
  let stride = 1;
  while (
    Math.ceil(dims[0] / stride) * Math.ceil(dims[1] / stride) * Math.ceil(dims[2] / stride) >
    maxVoxels
  ) {
    stride++;
  }
  return stride;
}

export interface ThresholdOptions {
  /** Foreground when value ≥ lo … */
  lo: number;
  /** … and ≤ hi (default: no upper bound). */
  hi?: number;
  region?: Region;
  /** Force a stride; by default the smallest one that fits `maxVoxels`. */
  stride?: number;
  maxVoxels?: number;
}

/**
 * Thresholds a volume (or a box of it) into a mask. At stride > 1 each mask
 * voxel takes the *mean* of its block, so thin structures fade rather than
 * vanish at random.
 */
export function thresholdMask(volume: LoadedVolume, options: ThresholdOptions): Mask3 {
  const { dims: sd, spacing } = volume.meta;
  const region = clampRegion(options.region ?? fullRegion(sd), sd);
  const rd = regionDims(region);
  const stride = options.stride ?? strideFor(rd, options.maxVoxels);
  const md: Vec3 = [
    Math.ceil(rd[0] / stride),
    Math.ceil(rd[1] / stride),
    Math.ceil(rd[2] / stride),
  ];
  const data = new Uint8Array(md[0] * md[1] * md[2]);
  const { voxels } = volume;
  const { lo } = options;
  const hi = options.hi ?? Number.POSITIVE_INFINITY;
  const [w, h] = sd;
  let count = 0;

  for (let k = 0; k < md[2]; k++) {
    const z0 = region.min[2] + k * stride;
    const z1 = Math.min(region.max[2], z0 + stride - 1);
    for (let j = 0; j < md[1]; j++) {
      const y0 = region.min[1] + j * stride;
      const y1 = Math.min(region.max[1], y0 + stride - 1);
      for (let i = 0; i < md[0]; i++) {
        const x0 = region.min[0] + i * stride;
        const x1 = Math.min(region.max[0], x0 + stride - 1);
        let value: number;
        if (stride === 1) {
          value = voxels[x0 + y0 * w + z0 * w * h];
        } else {
          let sum = 0;
          let n = 0;
          for (let z = z0; z <= z1; z++) {
            for (let y = y0; y <= y1; y++) {
              const row = y * w + z * w * h;
              for (let x = x0; x <= x1; x++) {
                sum += voxels[row + x];
                n++;
              }
            }
          }
          value = sum / n;
        }
        if (value >= lo && value <= hi) {
          data[i + j * md[0] + k * md[0] * md[1]] = 1;
          count++;
        }
      }
    }
  }

  return {
    data,
    dims: md,
    spacing: [spacing[0] * stride, spacing[1] * stride, spacing[2] * stride],
    stride,
    offset: [region.min[0], region.min[1], region.min[2]],
    count,
  };
}

/**
 * Visits every line of voxels that runs along `axis` — the scaffold of a
 * separable filter. A line's voxels are at `base + i * stride`, i = 0 … n − 1.
 */
export function forEachLine(
  dims: ArrayLike<number>,
  axis: number,
  visit: (base: number, stride: number, n: number) => void,
): void {
  const strides = [1, dims[0], dims[0] * dims[1]];
  const [a1, a2] = [0, 1, 2].filter((a) => a !== axis);
  for (let q = 0; q < dims[a2]; q++) {
    for (let p = 0; p < dims[a1]; p++) {
      visit(p * strides[a1] + q * strides[a2], strides[axis], dims[axis]);
    }
  }
}

/** Source-voxel coordinates of the centre of a (possibly fractional) mask position. */
export function maskToSource(mask: Mask3, p: ArrayLike<number>): Vec3 {
  const s = mask.stride;
  return [
    mask.offset[0] + p[0] * s + (s - 1) / 2,
    mask.offset[1] + p[1] * s + (s - 1) / 2,
    mask.offset[2] + p[2] * s + (s - 1) / 2,
  ];
}

/** Mask position of a source voxel. */
export function sourceToMask(mask: Mask3, p: ArrayLike<number>): Vec3 {
  const s = mask.stride;
  return [
    (p[0] - mask.offset[0] - (s - 1) / 2) / s,
    (p[1] - mask.offset[1] - (s - 1) / 2) / s,
    (p[2] - mask.offset[2] - (s - 1) / 2) / s,
  ];
}
