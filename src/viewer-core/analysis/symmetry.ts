import type { Axis, LoadedVolume, Vec3 } from '../types';
import { labelComponents } from './components';
import {
  type Mask3,
  type Region,
  clampRegion,
  fullRegion,
  maskToSource,
  regionDims,
  round,
  roundTriple,
  sourceToMask,
  thresholdMask,
} from './grid';
import { dilate, erode, subtract } from './morphology';
import { autoClasses } from './thresholds';

const AXES: Axis[] = ['x', 'y', 'z'];

/** What each end of a voxel axis means once the volume is patient-aligned (LPS). */
const SIDE_LABELS: Record<Axis, { low: string; high: string }> = {
  x: { low: 'right', high: 'left' },
  y: { low: 'anterior', high: 'posterior' },
  z: { low: 'inferior', high: 'superior' },
};

/** Longest edge, in voxels, of the coarse grid shapes are compared on. */
const SHAPE_GRID_EDGE = 96;

/** Slabs the asymmetry profile is cut into. */
const SLAB_COUNT = 12;

interface MirrorFit {
  /** Plane position in mask voxels (may be half-integer). */
  plane: number;
  dice: number;
}

/** Subject-versus-air mask on a coarse grid, for shape comparisons. */
function foregroundMask(volume: LoadedVolume, threshold?: number, region?: Region): Mask3 {
  const box = clampRegion(region ?? fullRegion(volume.meta.dims), volume.meta.dims);
  const longest = Math.max(...regionDims(box));
  return thresholdMask(volume, {
    lo: threshold ?? autoClasses(volume)[0],
    region: box,
    stride: Math.max(1, Math.ceil(longest / SHAPE_GRID_EDGE)),
  });
}

/** Coordinate of mask voxel (i, j, k) along the axis with index `a`. */
const along = (a: number, i: number, j: number, k: number) => (a === 0 ? i : a === 1 ? j : k);

/** Index step between neighbours along the axis with index `a`. */
const indexStride = (mask: Mask3, a: number) => [1, mask.dims[0], mask.dims[0] * mask.dims[1]][a];

/** Overlap of the mask with its mirror image about the plane at mask position q/2. */
function mirrorOverlap(mask: Mask3, a: number, q: number): number {
  const [w, h, d] = mask.dims;
  const n = mask.dims[a];
  const stride = indexStride(mask, a);
  const { data } = mask;
  let overlap = 0;
  let idx = 0;
  for (let k = 0; k < d; k++) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++, idx++) {
        if (!data[idx]) continue;
        const pos = along(a, i, j, k);
        const m = q - pos;
        if (m >= 0 && m < n && data[idx + (m - pos) * stride]) overlap++;
      }
    }
  }
  return overlap;
}

/** Best mirror plane along one axis, searched over the middle 40 % of the grid. */
function fitMirror(mask: Mask3, a: number): MirrorFit {
  const n = mask.dims[a];
  const qLo = Math.floor(0.6 * (n - 1));
  const qHi = Math.ceil(1.4 * (n - 1));
  let best: MirrorFit = { plane: (n - 1) / 2, dice: 0 };
  for (let q = qLo; q <= qHi; q++) {
    const dice = mask.count > 0 ? mirrorOverlap(mask, a, q) / mask.count : 0;
    if (dice > best.dice) best = { plane: q / 2, dice };
  }
  return best;
}

export interface UnmatchedPart {
  /** Which side of the plane holds the part; the other side has nothing to match it. */
  side: string;
  volumeMm3: number;
  centroidVoxel: Vec3;
  extentMm: Vec3;
  bboxVoxel: { min: Vec3; max: Vec3 };
}

export interface SymmetryReport {
  axes: Record<Axis, { planeVoxel: number; dice: number }>;
  best: Axis;
  planeVoxel: number;
  dice: number;
  sides: { low: string; high: string };
  volumeMm3: { low: number; high: number };
  /** (high − low) / (high + low) over the whole subject. */
  asymmetryIndex: number;
  /** The same index in slabs along the longest other axis. */
  profile: {
    axis: Axis;
    slabs: { fromVoxel: number; toVoxel: number; asymmetry: number | null }[];
  };
  unmatched: UnmatchedPart[];
  /** Source voxels per analysis voxel — the precision of positions here. */
  resolutionVoxels: number;
}

/**
 * Looks for the plane that best mirrors the subject (along each axis), then
 * reports what has no counterpart on the other side: a missing limb, an extra
 * structure, a swelling. Bilateral anatomy only — it says nothing about what is
 * normal, only that the two sides differ.
 */
export function checkSymmetry(
  volume: LoadedVolume,
  options: { threshold?: number; axis?: Axis; region?: Region } = {},
): SymmetryReport {
  const mask = foregroundMask(volume, options.threshold, options.region);
  const fits = AXES.map((_, i) => fitMirror(mask, i));
  const a = options.axis
    ? AXES.indexOf(options.axis)
    : fits.reduce((best, fit, i) => (fit.dice > fits[best].dice ? i : best), 0);
  const fit = fits[a];
  const q = Math.round(fit.plane * 2);
  const [w, h, d] = mask.dims;
  const stride = indexStride(mask, a);
  // The asymmetry profile runs along the longer of the two other axes.
  const stackAxis = [0, 1, 2]
    .filter((i) => i !== a)
    .sort((p, r) => mask.dims[r] * mask.spacing[r] - mask.dims[p] * mask.spacing[p])[0];
  const stackLength = mask.dims[stackAxis];

  const mirror = new Uint8Array(mask.data.length);
  const slabLow = new Float64Array(SLAB_COUNT);
  const slabHigh = new Float64Array(SLAB_COUNT);
  let low = 0;
  let high = 0;
  let idx = 0;
  for (let k = 0; k < d; k++) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++, idx++) {
        if (!mask.data[idx]) continue;
        const pos = along(a, i, j, k);
        const m = q - pos;
        if (m >= 0 && m < mask.dims[a]) mirror[idx + (m - pos) * stride] = 1;
        const slab = Math.min(
          SLAB_COUNT - 1,
          Math.floor((along(stackAxis, i, j, k) / stackLength) * SLAB_COUNT),
        );
        if (pos * 2 < q) {
          low++;
          slabLow[slab]++;
        } else if (pos * 2 > q) {
          high++;
          slabHigh[slab]++;
        }
      }
    }
  }

  // Opening removes the one-voxel shell a slightly imperfect plane always leaves.
  const opened = dilate(erode(subtract(mask, mirror), [1, 1, 1]), [1, 1, 1]);
  const parts = labelComponents(opened, {
    minVoxels: Math.max(8, Math.round(mask.count * 0.002)),
  });
  const sides = SIDE_LABELS[AXES[a]];
  const unmatched: UnmatchedPart[] = parts.objects.slice(0, 8).map((o) => ({
    side: sourceToMask(mask, o.centroid)[a] * 2 < q ? sides.low : sides.high,
    volumeMm3: round(o.volumeMm3, 0),
    centroidVoxel: roundTriple(o.centroid, 0),
    extentMm: roundTriple(o.extentMm, 0),
    bboxVoxel: { min: roundTriple(o.bbox.min, 0), max: roundTriple(o.bbox.max, 0) },
  }));

  const stackStart = maskToSource(mask, [0, 0, 0])[stackAxis];
  const slabEdge = (s: number) =>
    Math.round(stackStart + (s / SLAB_COUNT) * stackLength * mask.stride);
  const slabs = Array.from({ length: SLAB_COUNT }, (_, s) => {
    const sum = slabLow[s] + slabHigh[s];
    return {
      fromVoxel: slabEdge(s),
      toVoxel: slabEdge(s + 1),
      asymmetry: sum < 20 ? null : round((slabHigh[s] - slabLow[s]) / sum, 2),
    };
  });

  const describeFit = (i: number) => {
    const { plane, dice } = fits[i];
    return {
      planeVoxel: round(maskToSource(mask, [plane, plane, plane])[i], 1),
      dice: round(dice, 3),
    };
  };
  const voxelMm3 = mask.spacing[0] * mask.spacing[1] * mask.spacing[2];
  return {
    axes: { x: describeFit(0), y: describeFit(1), z: describeFit(2) },
    best: AXES[a],
    ...describeFit(a),
    sides,
    volumeMm3: { low: round(low * voxelMm3, 0), high: round(high * voxelMm3, 0) },
    asymmetryIndex: low + high === 0 ? 0 : round((high - low) / (high + low), 3),
    profile: { axis: AXES[stackAxis], slabs },
    unmatched,
    resolutionVoxels: mask.stride,
  };
}
