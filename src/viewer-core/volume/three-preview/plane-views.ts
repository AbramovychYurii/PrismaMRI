import type { SlicePlane, Vec3 } from '../../types';

/**
 * The standard views of the 3-D render, one per slice plane — what the slice
 * panels' "View from this side" turns the camera to: frontal, lateral and
 * top-down. `dir` is the direction from the orbit target to the camera, `up`
 * the camera's up vector.
 */
export const PLANE_VIEWS: Record<SlicePlane, { dir: Vec3; up: Vec3 }> = {
  coronal: { dir: [0, -1, 0], up: [0, 0, 1] },
  sagittal: { dir: [1, 0, 0], up: [0, 0, 1] },
  axial: { dir: [0, 0, 1], up: [0, -1, 0] },
};
