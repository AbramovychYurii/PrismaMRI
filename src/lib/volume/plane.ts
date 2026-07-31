import type { Axis } from '@/constants';
import { clamp } from '@/lib/volume/math';
import type { SlicePlane, VolumeCursor } from '@/types';

/** Any per-axis triple — voxel dimensions or millimetre spacing. */
type AxisTriple = readonly [number, number, number];

interface PlaneGeometry {
  /** Axis the slice index runs along. */
  slice: Axis;
  /** Axis mapped to the horizontal image fraction `fx`. */
  horizontal: Axis;
  /** Axis mapped to the vertical image fraction `fy`. */
  vertical: Axis;
  /** Vertical axis is drawn bottom-up so anatomy stays head-up. */
  verticalFlipped: boolean;
}

export const PLANE_GEOMETRY: Record<SlicePlane, PlaneGeometry> = {
  coronal: { slice: 'y', horizontal: 'x', vertical: 'z', verticalFlipped: true },
  sagittal: { slice: 'x', horizontal: 'y', vertical: 'z', verticalFlipped: true },
  axial: { slice: 'z', horizontal: 'x', vertical: 'y', verticalFlipped: false },
};

const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

export function alongAxis(triple: AxisTriple, axis: Axis): number {
  return triple[AXIS_INDEX[axis]];
}

export function sliceAxis(plane: SlicePlane): Axis {
  return PLANE_GEOMETRY[plane].slice;
}

/** Zero-based voxel coordinate of the slice this plane currently shows. */
export function sliceIndex(cursor: VolumeCursor, plane: SlicePlane): number {
  return cursor[sliceAxis(plane)];
}

/** One-based slice position as displayed to the user. */
export function sliceNumber(cursor: VolumeCursor, plane: SlicePlane): number {
  return sliceIndex(cursor, plane) + 1;
}

export function sliceCount(dims: AxisTriple, plane: SlicePlane): number {
  return alongAxis(dims, sliceAxis(plane));
}

export function volumeCenter(dims: AxisTriple): VolumeCursor {
  return {
    x: Math.floor(dims[0] / 2),
    y: Math.floor(dims[1] / 2),
    z: Math.floor(dims[2] / 2),
  };
}

export function clampToDims(cursor: VolumeCursor, dims: AxisTriple): VolumeCursor {
  return {
    x: clamp(cursor.x, 0, dims[0] - 1),
    y: clamp(cursor.y, 0, dims[1] - 1),
    z: clamp(cursor.z, 0, dims[2] - 1),
  };
}

/** Width-to-height ratio of the rendered slice in physical (millimetre) space. */
export function planeAspect(plane: SlicePlane, dims: AxisTriple, spacing: AxisTriple): number {
  const { horizontal, vertical } = PLANE_GEOMETRY[plane];
  const width = alongAxis(dims, horizontal) * alongAxis(spacing, horizontal);
  const height = alongAxis(dims, vertical) * alongAxis(spacing, vertical);
  return width / height;
}

/** Slab thickness in millimetres → slice count to include on each side. */
export function slabHalfSlices(plane: SlicePlane, slabMm: number, spacing: AxisTriple): number {
  if (slabMm <= 0) return 0;
  return Math.max(1, Math.round(slabMm / 2 / alongAxis(spacing, sliceAxis(plane))));
}

const axisFraction = (value: number, extent: number) => value / Math.max(1, extent - 1);

/** Position of a voxel within its slice, as 0..1 fractions of the slice image. */
export function voxelToFrac(
  plane: SlicePlane,
  voxel: VolumeCursor,
  dims: AxisTriple,
): { fx: number; fy: number } {
  const { horizontal, vertical, verticalFlipped } = PLANE_GEOMETRY[plane];
  const verticalExtent = alongAxis(dims, vertical);
  const verticalValue = verticalFlipped ? verticalExtent - 1 - voxel[vertical] : voxel[vertical];
  return {
    fx: axisFraction(voxel[horizontal], alongAxis(dims, horizontal)),
    fy: axisFraction(verticalValue, verticalExtent),
  };
}

/**
 * Inverse of {@link voxelToFrac}: the slice axis keeps its value from `cursor`,
 * so a 2-D position always resolves to a full 3-D voxel.
 */
export function fracToVoxel(
  plane: SlicePlane,
  fx: number,
  fy: number,
  cursor: VolumeCursor,
  dims: AxisTriple,
): VolumeCursor {
  const { horizontal, vertical, verticalFlipped } = PLANE_GEOMETRY[plane];
  const toVoxel = (fraction: number, axis: Axis) =>
    Math.round(fraction * (alongAxis(dims, axis) - 1));
  return {
    ...cursor,
    [horizontal]: toVoxel(fx, horizontal),
    [vertical]: toVoxel(verticalFlipped ? 1 - fy : fy, vertical),
  };
}
