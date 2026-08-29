import {
  PLANE_GEOMETRY,
  clampToDims,
  fracToVoxel,
  planeAspect,
  slabHalfSlices,
  sliceAxis,
  sliceCount,
  sliceIndex,
  sliceNumber,
  volumeCenter,
  voxelToFrac,
} from '@/lib/volume/plane';
import type { SlicePlane, Vec3, VolumeCursor } from '@/types';
import { describe, expect, it } from 'vitest';

const PLANES: SlicePlane[] = ['coronal', 'sagittal', 'axial'];

/** Every voxel of `dims`, so round-trips can be checked exhaustively. */
function* allVoxels(dims: Vec3): Generator<VolumeCursor> {
  for (let z = 0; z < dims[2]; z++)
    for (let y = 0; y < dims[1]; y++) for (let x = 0; x < dims[0]; x++) yield { x, y, z };
}

describe('voxel ↔ fraction round-trip', () => {
  // Deliberately anisotropic so a swapped axis cannot pass by coincidence, and
  // one degenerate case where an axis is a single voxel thick.
  const cases: Vec3[] = [
    [4, 3, 2],
    [7, 5, 11],
    [1, 6, 3],
    [5, 1, 4],
    [3, 3, 1],
  ];

  for (const dims of cases) {
    for (const plane of PLANES) {
      it(`${plane} ${dims.join('×')} survives voxel → frac → voxel for every voxel`, () => {
        for (const voxel of allVoxels(dims)) {
          const { fx, fy } = voxelToFrac(plane, voxel, dims);
          expect(fracToVoxel(plane, fx, fy, voxel, dims)).toEqual(voxel);
        }
      });
    }
  }

  it('keeps the slice axis from the cursor, not from the fractions', () => {
    const dims: Vec3 = [8, 6, 4];
    for (const plane of PLANES) {
      const axis = sliceAxis(plane);
      const cursor: VolumeCursor = { x: 1, y: 2, z: 3 };
      // Corners of the image must never move the slice we are looking at.
      for (const [fx, fy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [0.5, 0.5],
      ]) {
        expect(fracToVoxel(plane, fx, fy, cursor, dims)[axis]).toBe(cursor[axis]);
      }
    }
  });

  it('produces fractions inside 0..1', () => {
    const dims: Vec3 = [9, 4, 6];
    for (const plane of PLANES) {
      for (const voxel of allVoxels(dims)) {
        const { fx, fy } = voxelToFrac(plane, voxel, dims);
        expect(fx).toBeGreaterThanOrEqual(0);
        expect(fx).toBeLessThanOrEqual(1);
        expect(fy).toBeGreaterThanOrEqual(0);
        expect(fy).toBeLessThanOrEqual(1);
      }
    }
  });
});

/**
 * A round-trip only proves the two functions agree with each other — a
 * consistently mirrored pair would pass it. These pin the actual anatomical
 * direction, which is what a reader of the image depends on.
 */
describe('image orientation', () => {
  const dims: Vec3 = [10, 8, 6];
  const cursor: VolumeCursor = { x: 5, y: 4, z: 3 };

  it('draws coronal and sagittal head-up: top of the image is the highest z', () => {
    for (const plane of ['coronal', 'sagittal'] as const) {
      expect(PLANE_GEOMETRY[plane].verticalFlipped).toBe(true);
      expect(fracToVoxel(plane, 0.5, 0, cursor, dims).z).toBe(dims[2] - 1);
      expect(fracToVoxel(plane, 0.5, 1, cursor, dims).z).toBe(0);
    }
  });

  it('draws axial unflipped: top of the image is y = 0', () => {
    expect(PLANE_GEOMETRY.axial.verticalFlipped).toBe(false);
    expect(fracToVoxel('axial', 0.5, 0, cursor, dims).y).toBe(0);
    expect(fracToVoxel('axial', 0.5, 1, cursor, dims).y).toBe(dims[1] - 1);
  });

  it('runs the horizontal axis left → right in increasing voxel order', () => {
    for (const plane of PLANES) {
      const horizontal = PLANE_GEOMETRY[plane].horizontal;
      const left = fracToVoxel(plane, 0, 0.5, cursor, dims)[horizontal];
      const right = fracToVoxel(plane, 1, 0.5, cursor, dims)[horizontal];
      expect(left).toBe(0);
      expect(right).toBe(dims[{ x: 0, y: 1, z: 2 }[horizontal]] - 1);
    }
  });
});

describe('slice indexing', () => {
  it('maps each plane to the axis it steps along', () => {
    expect(sliceAxis('coronal')).toBe('y');
    expect(sliceAxis('sagittal')).toBe('x');
    expect(sliceAxis('axial')).toBe('z');
  });

  it('numbers slices one-based for display but indexes them zero-based', () => {
    const cursor: VolumeCursor = { x: 3, y: 7, z: 2 };
    for (const plane of PLANES) {
      expect(sliceNumber(cursor, plane)).toBe(sliceIndex(cursor, plane) + 1);
    }
    expect(sliceIndex(cursor, 'coronal')).toBe(7);
    expect(sliceIndex(cursor, 'sagittal')).toBe(3);
    expect(sliceIndex(cursor, 'axial')).toBe(2);
  });

  it('counts slices along the stepping axis', () => {
    const dims: Vec3 = [10, 20, 30];
    expect(sliceCount(dims, 'coronal')).toBe(20);
    expect(sliceCount(dims, 'sagittal')).toBe(10);
    expect(sliceCount(dims, 'axial')).toBe(30);
  });
});

describe('volumeCenter / clampToDims', () => {
  it('centres on the middle voxel, rounding down on even extents', () => {
    expect(volumeCenter([10, 21, 4])).toEqual({ x: 5, y: 10, z: 2 });
  });

  it('always returns an in-range cursor', () => {
    const dims: Vec3 = [4, 4, 4];
    expect(clampToDims({ x: -5, y: 99, z: 2 }, dims)).toEqual({ x: 0, y: 3, z: 2 });
    expect(clampToDims(volumeCenter(dims), dims)).toEqual(volumeCenter(dims));
  });

  it('leaves an already-valid cursor untouched', () => {
    const dims: Vec3 = [6, 6, 6];
    for (const voxel of allVoxels(dims)) expect(clampToDims(voxel, dims)).toEqual(voxel);
  });
});

describe('planeAspect', () => {
  it('measures in millimetres, not voxels', () => {
    // 100 voxels × 0.5 mm = 50 mm wide; 50 voxels × 2 mm = 100 mm tall.
    // Ignoring spacing would give 2 instead of 0.5 — the classic squashed-image bug.
    expect(planeAspect('axial', [100, 50, 10], [0.5, 2, 1])).toBeCloseTo(0.5);
  });

  it('is 1 for a physically square slice', () => {
    expect(planeAspect('coronal', [10, 4, 20], [2, 1, 1])).toBeCloseTo(1);
  });
});

describe('slabHalfSlices', () => {
  it('is 0 when slabbing is off', () => {
    expect(slabHalfSlices('axial', 0, [1, 1, 1])).toBe(0);
    expect(slabHalfSlices('axial', -5, [1, 1, 1])).toBe(0);
  });

  it('converts millimetres to slices using the stepping axis spacing', () => {
    // Axial steps along z: 10 mm slab / 2 = 5 mm per side ÷ 0.5 mm = 10 slices.
    expect(slabHalfSlices('axial', 10, [1, 1, 0.5])).toBe(10);
    // Coronal steps along y, so it reads a different spacing for the same slab.
    expect(slabHalfSlices('coronal', 10, [1, 2.5, 0.5])).toBe(2);
  });

  it('never rounds a requested slab down to nothing', () => {
    expect(slabHalfSlices('axial', 0.1, [1, 1, 10])).toBe(1);
  });
});
