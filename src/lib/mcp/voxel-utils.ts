import { PLANE_GEOMETRY, volumeCenter } from '@/lib/volume/plane';
import type { LoadedVolume, SlicePlane, VolumeCursor } from '@/types';

/** Scalar value at a voxel (post slope/intercept), or −Infinity when out of bounds. */
export function getVoxelScalar(
  voxels: Float32Array | Int16Array,
  dims: readonly [number, number, number],
  x: number,
  y: number,
  z: number,
): number {
  const [w, h, d] = dims;
  if (x < 0 || x >= w || y < 0 || y >= h || z < 0 || z >= d) return Number.NEGATIVE_INFINITY;
  return voxels[x + y * w + z * w * h];
}

const SNAP_MAX_STEPS = 300;

/**
 * Fraction of `[scalarMin, scalarMax]` separating air from soft tissue —
 * 15 % holds across CT and CBCT.
 */
const SNAP_TISSUE_FRACTION = 0.15;

/**
 * Walks a voxel that landed in air toward the slice centre until it reaches
 * anatomy, moving one step along each of the plane's two visible axes per
 * iteration. Returns the input unchanged when it is already inside anatomy or
 * when no anatomy is found within {@link SNAP_MAX_STEPS}.
 */
export function snapToAnatomy(
  voxel: VolumeCursor,
  plane: SlicePlane,
  volume: LoadedVolume,
): VolumeCursor {
  const { voxels, meta } = volume;
  const { dims } = meta;
  const threshold = volume.scalarMin + (volume.scalarMax - volume.scalarMin) * SNAP_TISSUE_FRACTION;
  const isAnatomy = (v: VolumeCursor) => getVoxelScalar(voxels, dims, v.x, v.y, v.z) >= threshold;

  if (isAnatomy(voxel)) return voxel;

  const center = volumeCenter(dims);
  const { horizontal, vertical } = PLANE_GEOMETRY[plane];
  const stepToCenter = (v: VolumeCursor, axis: 'x' | 'y' | 'z') => {
    if (v[axis] !== center[axis]) v[axis] += v[axis] > center[axis] ? -1 : 1;
  };

  const walker = { ...voxel };
  for (let step = 0; step < SNAP_MAX_STEPS; step++) {
    stepToCenter(walker, horizontal);
    stepToCenter(walker, vertical);
    if (isAnatomy(walker)) return { ...walker };
  }
  return voxel;
}
