import { describe, expect, it } from 'vitest';
import type { LoadedVolume, Vec3, VoxelArray } from '../types';
import { canonicalMapping, reorientToCanonical } from './orientation';

const IDENTITY: [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Voxel value = its stored index, so every move is visible in the output. */
function volume(dims: Vec3, spacing: Vec3 = [1, 1, 1], voxels?: VoxelArray): LoadedVolume {
  const count = dims[0] * dims[1] * dims[2];
  return {
    voxels: voxels ?? Float32Array.from({ length: count }, (_, i) => i),
    meta: { dims, spacing, origin: [10, 20, 30], bitsAllocated: 16 },
    scalarMin: 0,
    scalarMax: count - 1,
    windowLevel: { window: 1, level: 0 },
    formatId: 'nrrd',
  };
}

/** Value at canonical (x, y, z) of a reoriented volume. */
function at(v: LoadedVolume, x: number, y: number, z: number): number {
  const [nx, ny] = v.meta.dims;
  return v.voxels[x + nx * (y + ny * z)];
}

describe('canonicalMapping', () => {
  it('keeps an LPS-aligned volume as is', () => {
    expect(canonicalMapping(IDENTITY)).toEqual([
      { axis: 0, flip: false },
      { axis: 1, flip: false },
      { axis: 2, flip: false },
    ]);
  });

  it('maps a sagittal acquisition onto the patient axes', () => {
    // Columns run posterior, rows inferior, slices towards the patient's right.
    expect(
      canonicalMapping([
        [0, 1, 0],
        [0, 0, -1],
        [-1, 0, 0],
      ]),
    ).toEqual([
      { axis: 2, flip: true },
      { axis: 0, flip: false },
      { axis: 1, flip: true },
    ]);
  });

  it('picks the nearest axis for an oblique series, never one twice', () => {
    // A coronal series tilted 30° about x: rows lean from -z towards +y.
    const t = (30 * Math.PI) / 180;
    expect(
      canonicalMapping([
        [1, 0, 0],
        [0, Math.sin(t), -Math.cos(t)],
        [0, Math.cos(t), Math.sin(t)],
      ]),
    ).toEqual([
      { axis: 0, flip: false },
      { axis: 2, flip: false },
      { axis: 1, flip: true },
    ]);
  });

  it('ignores length — sform columns carry the spacing', () => {
    expect(
      canonicalMapping([
        [0, 0, 5],
        [0.25, 0, 0],
        [0, -3, 0],
      ]),
    ).toEqual([
      { axis: 1, flip: false },
      { axis: 2, flip: true },
      { axis: 0, flip: false },
    ]);
  });

  it('gives up on a missing or degenerate direction', () => {
    expect(
      canonicalMapping([
        [1, 0, 0],
        [0, 0, 0],
        [0, 0, 1],
      ]),
    ).toBeNull();
    expect(
      canonicalMapping([
        [1, 0, 0],
        [Number.NaN, 1, 0],
        [0, 0, 1],
      ]),
    ).toBeNull();
  });
});

describe('reorientToCanonical', () => {
  it('returns the same volume when there is nothing to do', () => {
    const v = volume([2, 3, 4]);
    expect(reorientToCanonical(v, undefined)).toBe(v);
    expect(reorientToCanonical(v, IDENTITY)).toBe(v);
  });

  it('flips an axis that runs backwards', () => {
    const v = volume([3, 1, 1]);
    const out = reorientToCanonical(v, [
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(Array.from(out.voxels)).toEqual([2, 1, 0]);
    // Voxel 0 is now the stored voxel 2, two millimetres towards the right.
    expect(out.meta.origin).toEqual([8, 20, 30]);
  });

  it('permutes a sagittal series so each panel shows its own plane', () => {
    // 3 columns (posterior), 2 rows (inferior), 4 slices (towards the right).
    const v = volume([3, 2, 4], [0.5, 2, 5]);
    const out = reorientToCanonical(v, [
      [0, 1, 0],
      [0, 0, -1],
      [-1, 0, 0],
    ]);
    expect(out.meta.dims).toEqual([4, 3, 2]);
    expect(out.meta.spacing).toEqual([5, 0.5, 2]);
    const stored = (col: number, row: number, slice: number) => col + 3 * (row + 2 * slice);
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 3; y++) {
        for (let z = 0; z < 2; z++) {
          // Left is the last slice, posterior the column, superior the first row.
          expect(at(out, x, y, z)).toBe(stored(y, 1 - z, 3 - x));
        }
      }
    }
    // Last slice is 15 mm to the right (−x); the last row 2 mm down (−z).
    expect(out.meta.origin).toEqual([-5, 20, 28]);
  });

  it('keeps Int16 storage', () => {
    const v = volume([2, 1, 1], [1, 1, 1], Int16Array.of(7, -3));
    const out = reorientToCanonical(v, [
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(out.voxels).toBeInstanceOf(Int16Array);
    expect(Array.from(out.voxels)).toEqual([-3, 7]);
  });
});
