/**
 * Voxel-space helpers used by the MCP bridge to translate between MCP
 * arguments (1-indexed slice numbers, plane-fraction coordinates) and the
 * viewer's internal 3-D voxel cursor.
 *
 * Pure — no React, no Zustand, no DOM.
 */

import type { LoadedVolume, SlicePlane, VolumeCursor } from '@/types';

// ── Slice indexing ───────────────────────────────────────────────────────────

/** Returns the 1-based slice index for the given plane at the cursor. */
export function sliceIndex(cursor: VolumeCursor, plane: SlicePlane): number {
  return plane === 'coronal' ? cursor.y + 1 : plane === 'sagittal' ? cursor.x + 1 : cursor.z + 1;
}

/** Total slice count along the plane's primary axis. */
export function sliceTotal(dims: [number, number, number], plane: SlicePlane): number {
  return plane === 'coronal' ? dims[1] : plane === 'sagittal' ? dims[0] : dims[2];
}

/** Clamp a single voxel coordinate to `[0, max - 1]`. */
export function clampVoxel(v: number, max: number): number {
  return Math.max(0, Math.min(max - 1, v));
}

// ── Slab MIP geometry ────────────────────────────────────────────────────────

/** Slab thickness in mm → half-slab slice count for a plane. */
export function halfSlabsFor(
  plane: SlicePlane,
  slabMm: number,
  spacing: readonly [number, number, number],
): number {
  if (slabMm <= 0) return 0;
  const mmPerSlice = plane === 'axial' ? spacing[2] : plane === 'coronal' ? spacing[1] : spacing[0];
  return Math.max(1, Math.round(slabMm / 2 / mmPerSlice));
}

// ── Fraction-to-voxel conversion ─────────────────────────────────────────────

/**
 * Derive a full voxel position from a plane + canvas fraction + current cursor,
 * so a 2-D placement also yields a 3-D-anchored point. Mirrors cursorFromClick.
 */
export function voxelFromFrac(
  plane: SlicePlane,
  fx: number,
  fy: number,
  cursor: VolumeCursor,
  dims: readonly [number, number, number],
): VolumeCursor {
  const [w, h, d] = dims;
  const v: VolumeCursor = { ...cursor };
  if (plane === 'coronal') {
    v.x = Math.round(fx * (w - 1));
    v.z = Math.round((1 - fy) * (d - 1));
  } else if (plane === 'sagittal') {
    v.y = Math.round(fx * (h - 1));
    v.z = Math.round((1 - fy) * (d - 1));
  } else {
    v.x = Math.round(fx * (w - 1));
    v.y = Math.round(fy * (h - 1));
  }
  return v;
}

// ── Anatomy snapping ─────────────────────────────────────────────────────────

/**
 * Read a single voxel's scalar value (post slope/intercept).
 * Returns −Infinity if the coordinate is outside the volume bounds.
 */
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

/** Hard cap on the walk distance — anatomy snapping bails after this many steps. */
const SNAP_MAX_STEPS = 300;

/** Fraction of `[scalarMin, scalarMax]` that separates air from soft tissue. */
const SNAP_TISSUE_FRACTION = 0.15;

/**
 * If the target voxel lands in air / outside anatomy, walk one step at a time
 * toward the slice centre (on the two axes visible in the current plane) until
 * we find a voxel above the tissue threshold.
 *
 * Threshold is adaptive: scalarMin + 15 % of the full scalar range, which
 * safely separates air from soft tissue and bone across CT and CBCT modalities.
 *
 * Returns the original voxel unchanged when it is already inside anatomy.
 */
export function snapToAnatomy(
  voxel: VolumeCursor,
  plane: SlicePlane,
  volume: LoadedVolume,
): VolumeCursor {
  const threshold = volume.scalarMin + (volume.scalarMax - volume.scalarMin) * SNAP_TISSUE_FRACTION;
  const { voxels, meta } = volume;
  const { dims } = meta;

  if (getVoxelScalar(voxels, dims, voxel.x, voxel.y, voxel.z) >= threshold) return voxel;

  // Centre of the volume on each axis.
  const cx = Math.floor(dims[0] / 2);
  const cy = Math.floor(dims[1] / 2);
  const cz = Math.floor(dims[2] / 2);

  let { x, y, z } = voxel;

  for (let step = 0; step < SNAP_MAX_STEPS; step++) {
    // Move one step toward slice-plane centre on the two displayed axes.
    if (plane === 'coronal') {
      if (x !== cx) x += x > cx ? -1 : 1;
      if (z !== cz) z += z > cz ? -1 : 1;
    } else if (plane === 'sagittal') {
      if (y !== cy) y += y > cy ? -1 : 1;
      if (z !== cz) z += z > cz ? -1 : 1;
    } else {
      if (x !== cx) x += x > cx ? -1 : 1;
      if (y !== cy) y += y > cy ? -1 : 1;
    }
    if (getVoxelScalar(voxels, dims, x, y, z) >= threshold) return { x, y, z };
  }

  return voxel; // fallback: original position if anatomy not found
}
