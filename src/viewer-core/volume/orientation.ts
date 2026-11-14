import type { LoadedVolume, Vec3, VoxelArray } from '../types';

/**
 * Where each stored voxel axis points in the patient, in DICOM's LPS frame
 * (+x towards the patient's left, +y posterior, +z superior): `[i, j, k]`,
 * with `i` the fastest-varying index. Vectors need not be unit length.
 */
export type AxisDirections = readonly [Vec3, Vec3, Vec3];

/** The stored axis that becomes one canonical axis, and whether it runs backwards. */
export interface AxisSource {
  axis: 0 | 1 | 2;
  flip: boolean;
}

/** Indexed by canonical axis: x (left), y (posterior), z (superior). */
export type CanonicalMapping = readonly [AxisSource, AxisSource, AxisSource];

/** RAS (NIfTI world) → LPS: the two frames differ by the sign of x and y. */
export function rasToLps(v: Vec3): Vec3 {
  return [-v[0], -v[1], v[2]];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(v: Vec3): Vec3 | null {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(len) || len === 0) return null;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Which stored axis lands on each canonical axis, choosing for every axis the
 * patient direction it is closest to — the same nearest-orthogonal choice
 * nibabel's `as_closest_canonical` makes, so an oblique series lands on the
 * planes it was prescribed nearest to.
 *
 * Pairs are taken greedily by largest cosine, so two axes can never claim one
 * patient direction. Null when a direction is missing, degenerate or the three
 * do not span a volume.
 */
export function canonicalMapping(dirs: AxisDirections): CanonicalMapping | null {
  const units = dirs.map(unit);
  if (units.some((u) => u === null)) return null;
  const u = units as Vec3[];

  const mapping: (AxisSource | undefined)[] = [undefined, undefined, undefined];
  const usedAxis = [false, false, false];
  for (let round = 0; round < 3; round++) {
    let best = 0;
    let bestAxis = -1;
    let bestWorld = -1;
    for (let a = 0; a < 3; a++) {
      if (usedAxis[a]) continue;
      for (let w = 0; w < 3; w++) {
        if (mapping[w]) continue;
        const c = Math.abs(u[a][w]);
        if (c > best) {
          best = c;
          bestAxis = a;
          bestWorld = w;
        }
      }
    }
    if (bestAxis < 0) return null;
    usedAxis[bestAxis] = true;
    mapping[bestWorld] = { axis: bestAxis as 0 | 1 | 2, flip: u[bestAxis][bestWorld] < 0 };
  }
  return mapping as unknown as CanonicalMapping;
}

function isIdentity(m: CanonicalMapping): boolean {
  return m.every((s, w) => s.axis === w && !s.flip);
}

/**
 * Copies `src` (stored order, `dims`) into canonical order: one pass over the
 * output with a precomputed source stride per output axis, so a flip is a
 * negative stride and a permutation is a reordered one.
 */
function permuteVoxels(src: VoxelArray, dims: Vec3, m: CanonicalMapping): VoxelArray {
  const srcStride = [1, dims[0], dims[0] * dims[1]];
  const outDims = m.map((s) => dims[s.axis]);
  const step = m.map((s) => (s.flip ? -srcStride[s.axis] : srcStride[s.axis]));
  let base = 0;
  for (const s of m) if (s.flip) base += (dims[s.axis] - 1) * srcStride[s.axis];

  const out = src instanceof Int16Array ? new Int16Array(src.length) : new Float32Array(src.length);
  let o = 0;
  for (let z = 0; z < outDims[2]; z++) {
    const rowZ = base + z * step[2];
    for (let y = 0; y < outDims[1]; y++) {
      let p = rowZ + y * step[1];
      for (let x = 0; x < outDims[0]; x++) {
        out[o++] = src[p];
        p += step[0];
      }
    }
  }
  return out;
}

/**
 * The volume with its voxel axes running towards patient left, posterior and
 * superior — the frame every plane is drawn in (see PLANE_GEOMETRY and the
 * R/L, A/P labels on the panels).
 *
 * Files store voxels in acquisition order: a sagittal MRI series has its rows
 * and columns along A–P and S–I and its slices along L–R. Drawn as stored, its
 * slices appeared in the axial panel and the 3-D model lay on its side.
 *
 * Without directions (a header that does not record them) the volume is
 * returned as stored, as is one that is already canonical — no copy.
 */
export function reorientToCanonical(
  volume: LoadedVolume,
  dirs: AxisDirections | undefined,
): LoadedVolume {
  if (!dirs) return volume;
  const m = canonicalMapping(dirs);
  if (!m || isIdentity(m)) return volume;

  const { dims, spacing, origin } = volume.meta;
  // Voxel 0 moves to the far end of every flipped axis; keep `origin` the
  // patient position of whichever voxel is now first.
  const newOrigin: Vec3 = [origin[0], origin[1], origin[2]];
  for (const s of m) {
    if (!s.flip) continue;
    const d = unit(dirs[s.axis]) as Vec3;
    const extent = (dims[s.axis] - 1) * spacing[s.axis];
    for (let w = 0; w < 3; w++) newOrigin[w] += d[w] * extent;
  }

  return {
    ...volume,
    voxels: permuteVoxels(volume.voxels, dims, m),
    meta: {
      ...volume.meta,
      dims: [dims[m[0].axis], dims[m[1].axis], dims[m[2].axis]],
      spacing: [spacing[m[0].axis], spacing[m[1].axis], spacing[m[2].axis]],
      origin: newOrigin,
    },
  };
}
