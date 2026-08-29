import {
  PLANE_GEOMETRY,
  clampToDims,
  cursorToTextureVoxel,
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

describe('cursorToTextureVoxel', () => {
  it('is the identity when the texture was not shrunk', () => {
    const dims: Vec3 = [10, 8, 6];
    for (const voxel of allVoxels(dims)) {
      expect(cursorToTextureVoxel(voxel, dims, dims)).toEqual([voxel.x, voxel.y, voxel.z]);
    }
  });

  it('maps the ends of each axis onto the ends of the texture', () => {
    const source: Vec3 = [101, 51, 11];
    const texture: Vec3 = [51, 26, 6];
    expect(cursorToTextureVoxel({ x: 0, y: 0, z: 0 }, texture, source)).toEqual([0, 0, 0]);
    expect(cursorToTextureVoxel({ x: 100, y: 50, z: 10 }, texture, source)).toEqual([50, 25, 5]);
  });

  it('puts the middle of the volume in the middle of the texture', () => {
    const [x] = cursorToTextureVoxel({ x: 50, y: 0, z: 0 }, [51, 51, 51], [101, 101, 101]);
    expect(x).toBeCloseTo(25);
  });

  it('scales each axis by its own ratio', () => {
    // Only z was reduced — x and y must come through untouched.
    const source: Vec3 = [9, 9, 101];
    const texture: Vec3 = [9, 9, 51];
    expect(cursorToTextureVoxel({ x: 4, y: 7, z: 100 }, texture, source)).toEqual([4, 7, 50]);
  });

  it('keeps fractional positions instead of snapping to a texel', () => {
    // The shader interpolates; rounding here would make the plane jump.
    const [, , z] = cursorToTextureVoxel({ x: 0, y: 0, z: 3 }, [5, 5, 5], [9, 9, 9]);
    expect(z).toBeCloseTo(1.5);
    expect(Number.isInteger(z)).toBe(false);
  });

  it('never leaves the texture', () => {
    const source: Vec3 = [64, 33, 7];
    const texture: Vec3 = [32, 17, 7];
    for (const voxel of allVoxels(source)) {
      const out = cursorToTextureVoxel(voxel, texture, source);
      for (let i = 0; i < 3; i++) {
        expect(out[i]).toBeGreaterThanOrEqual(0);
        expect(out[i]).toBeLessThanOrEqual(texture[i] - 1);
      }
    }
  });

  it('rises monotonically along each axis', () => {
    const source: Vec3 = [40, 40, 40];
    const texture: Vec3 = [13, 13, 13];
    let previous = -1;
    for (let x = 0; x < 40; x++) {
      const [mapped] = cursorToTextureVoxel({ x, y: 0, z: 0 }, texture, source);
      expect(mapped).toBeGreaterThanOrEqual(previous);
      previous = mapped;
    }
  });

  it('survives a single-voxel axis without dividing by zero', () => {
    const out = cursorToTextureVoxel({ x: 0, y: 2, z: 0 }, [1, 5, 1], [1, 9, 1]);
    expect(out.every(Number.isFinite)).toBe(true);
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(0);
  });
});

/**
 * cursorToTextureVoxel replaced a `CursorPlanes` class whose only real method
 * was this arithmetic. The class is gone, so its body is transcribed here as
 * an oracle: the refactor is only correct if the shader keeps receiving the
 * exact same plane position it did before.
 */
function legacyMapCursor(
  cursor: VolumeCursor,
  dims: Vec3,
  srcDims: Vec3,
): [number, number, number] {
  const [w, h, d] = dims;
  return [
    (cursor.x / Math.max(1, srcDims[0] - 1)) * (w - 1),
    (cursor.y / Math.max(1, srcDims[1] - 1)) * (h - 1),
    (cursor.z / Math.max(1, srcDims[2] - 1)) * (d - 1),
  ];
}

describe('cursorToTextureVoxel matches the class it replaced', () => {
  const cases: Array<{ texture: Vec3; source: Vec3 }> = [
    { texture: [1, 1, 1], source: [1, 1, 1] }, // degenerate
    { texture: [8, 6, 4], source: [8, 6, 4] }, // no reduction
    { texture: [256, 256, 498], source: [512, 512, 996] }, // the old uniform stride
    { texture: [512, 512, 512], source: [512, 512, 996] }, // per-axis, after the 07 fix
    { texture: [401, 401, 201], source: [401, 401, 201] },
    { texture: [17, 33, 5], source: [40, 100, 7] }, // awkward ratios
  ];

  it('agrees bit for bit across every axis and dimension pair', () => {
    for (const { texture, source } of cases) {
      // Coprime strides so the samples do not line up with any dimension.
      for (let x = 0; x < source[0]; x += 37)
        for (let y = 0; y < source[1]; y += 41)
          for (let z = 0; z < source[2]; z += 43) {
            const cursor = { x, y, z };
            expect(cursorToTextureVoxel(cursor, texture, source)).toEqual(
              legacyMapCursor(cursor, texture, source),
            );
          }
    }
  });

  it('agrees on the exact corners, where off-by-one would hide', () => {
    for (const { texture, source } of cases) {
      for (const cursor of [
        { x: 0, y: 0, z: 0 },
        { x: source[0] - 1, y: source[1] - 1, z: source[2] - 1 },
      ]) {
        expect(cursorToTextureVoxel(cursor, texture, source)).toEqual(
          legacyMapCursor(cursor, texture, source),
        );
      }
    }
  });
});
