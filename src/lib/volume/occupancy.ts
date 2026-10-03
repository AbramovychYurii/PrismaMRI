import type { Vec3 } from '@/types';

/** Cells per edge of the empty-space-skipping grid. */
export const OCCUPANCY_EDGE = 32;

/**
 * Compute a coarse occupancy grid for empty-space skipping in the DVR ray
 * march.  Each cell of the OCC³ grid stores 255 if ANY voxel inside that
 * cell exceeds a low intensity threshold (≈ air ceiling), else 0.
 *
 * At render time the shader samples this grid for each ray step and, on an
 * empty cell, jumps several steps ahead — air-filled regions (typically
 * 30-60 % of a scan's bounding box) get traversed for free instead of
 * paying a full TF lookup + AO + Phong fetch budget per step.
 *
 * OCC=32 is a sweet spot: the grid is tiny (32 KB texture), each cell
 * covers ~8-16 voxels so skips don't overshoot into tissue, and it builds
 * in <300 ms even for a full-body CT.
 */
export function computeOccupancy(data: Uint8Array, dims: Vec3): Uint8Array {
  const [w, h, d] = dims;
  const OCC = OCCUPANCY_EDGE;
  // 25/255 ≈ 10 % of the data range — well above true air for both CT
  // (HU≈-1024 is mapped to 0) and MRI (background noise is usually <5 %).
  // Conservative: a few tissue voxels classed as air is invisible; the
  // reverse (skipping past tissue) would leave holes.
  const THRESHOLD = 25;

  const vol = data;
  const grid = new Uint8Array(OCC * OCC * OCC);

  const sliceStride = w * h;
  const dInv = OCC / d;
  const hInv = OCC / h;
  const wInv = OCC / w;

  for (let oz = 0; oz < OCC; oz++) {
    const z0 = Math.floor(oz / dInv);
    const z1 = Math.min(d, Math.ceil((oz + 1) / dInv));
    for (let oy = 0; oy < OCC; oy++) {
      const y0 = Math.floor(oy / hInv);
      const y1 = Math.min(h, Math.ceil((oy + 1) / hInv));
      for (let ox = 0; ox < OCC; ox++) {
        const x0 = Math.floor(ox / wInv);
        const x1 = Math.min(w, Math.ceil((ox + 1) / wInv));
        let occupied = 0;
        // Tight inner loop — early-out on first occupied voxel.
        outer: for (let z = z0; z < z1; z++) {
          const baseZ = z * sliceStride;
          for (let y = y0; y < y1; y++) {
            const base = baseZ + y * w;
            for (let x = x0; x < x1; x++) {
              if (vol[base + x] >= THRESHOLD) {
                occupied = 255;
                break outer;
              }
            }
          }
        }
        grid[oz * OCC * OCC + oy * OCC + ox] = occupied;
      }
    }
  }

  return grid;
}
