import { extractSliceGrayImage } from '@/lib/volume/slices';
import type { LoadedVolume, SliceImage, SlicePlane, Vec3, VoxelArray } from '@/types';
import { describe, expect, it } from 'vitest';

/**
 * With this window every scalar 0..255 maps to itself in grayscale
 * (lower = 0, span = 255), so an expected image can be written as the voxel
 * values themselves instead of as pre-computed gray levels.
 */
const IDENTITY_WL = { window: 255, level: 127.5 };

const DIMS: Vec3 = [4, 3, 2];

/** Voxel value = its own linear index, so every pixel names where it came from. */
function makeVolume(kind: 'f32' | 'i16', dims: Vec3 = DIMS): LoadedVolume {
  const count = dims[0] * dims[1] * dims[2];
  const voxels: VoxelArray = kind === 'i16' ? new Int16Array(count) : new Float32Array(count);
  for (let i = 0; i < count; i++) voxels[i] = i;
  return {
    voxels,
    meta: {
      dims,
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      bitsAllocated: 16,
    },
    scalarMin: 0,
    scalarMax: count - 1,
    windowLevel: IDENTITY_WL,
    formatId: 'nrrd',
  };
}

/** The gray channel as rows of numbers — RGBA is opaque gray by construction. */
function toRows(image: SliceImage): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < image.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < image.width; x++) row.push(image.data[(y * image.width + x) * 4]);
    rows.push(row);
  }
  return rows;
}

function grayOf(volume: LoadedVolume, plane: SlicePlane, index: number, halfSlabs = 0) {
  return toRows(extractSliceGrayImage(volume, plane, index, IDENTITY_WL, halfSlabs));
}

describe('slice layout', () => {
  // dims [4,3,2] → index = x + 4y + 12z.
  const volume = makeVolume('f32');

  it('lays axial out in natural row order', () => {
    // Axial steps along z and needs no flip: rows run y = 0,1,2 left-to-right.
    expect(grayOf(volume, 'axial', 1)).toEqual([
      [12, 13, 14, 15],
      [16, 17, 18, 19],
      [20, 21, 22, 23],
    ]);
  });

  it('draws coronal bottom-up so anatomy stays head-up', () => {
    // Coronal steps along y; rows walk z backwards, so the first row is z = 1.
    expect(grayOf(volume, 'coronal', 1)).toEqual([
      [16, 17, 18, 19],
      [4, 5, 6, 7],
    ]);
  });

  it('draws sagittal bottom-up and strides across y', () => {
    // Sagittal steps along x; columns walk y (stride 4), rows walk z backwards.
    expect(grayOf(volume, 'sagittal', 2)).toEqual([
      [14, 18, 22],
      [2, 6, 10],
    ]);
  });

  it('sizes each plane from the two axes it spans', () => {
    const [w, h, d] = DIMS;
    const size = (plane: SlicePlane) => {
      const img = extractSliceGrayImage(volume, plane, 0, IDENTITY_WL);
      return [img.width, img.height];
    };
    expect(size('axial')).toEqual([w, h]);
    expect(size('coronal')).toEqual([w, d]);
    expect(size('sagittal')).toEqual([h, d]);
  });

  it('fills every pixel opaque', () => {
    for (const plane of ['coronal', 'sagittal', 'axial'] as const) {
      const img = extractSliceGrayImage(volume, plane, 0, IDENTITY_WL);
      for (let i = 3; i < img.data.length; i += 4) expect(img.data[i]).toBe(255);
    }
  });
});

describe('Int16 lookup table vs direct mapping', () => {
  it('produces byte-identical slices on both paths', () => {
    // Int16 volumes go through a precomputed W/L LUT; Float32 volumes compute
    // each pixel directly. The two must not drift apart.
    const viaLut = makeVolume('i16');
    const direct = makeVolume('f32');
    for (const plane of ['coronal', 'sagittal', 'axial'] as const) {
      for (let i = 0; i < 2; i++) {
        expect(grayOf(viaLut, plane, i)).toEqual(grayOf(direct, plane, i));
      }
    }
  });

  it('agrees across a range of windows and levels', () => {
    const viaLut = makeVolume('i16');
    const direct = makeVolume('f32');
    for (const wl of [
      { window: 10, level: 12 },
      { window: 255, level: 127.5 },
      { window: 4000, level: 0 },
      { window: 1, level: 5 },
    ]) {
      const a = extractSliceGrayImage(viaLut, 'axial', 1, wl);
      const b = extractSliceGrayImage(direct, 'axial', 1, wl);
      expect(Array.from(a.data)).toEqual(Array.from(b.data));
    }
  });
});

describe('slab MIP', () => {
  it('takes the per-pixel maximum across the slab', () => {
    const volume = makeVolume('f32');
    // Coronal at y = 1 with one slice either side spans y = 0..2. Value grows
    // with y, so every pixel should come from y = 2: value = x + 8 + 12z.
    expect(grayOf(volume, 'coronal', 1, 1)).toEqual([
      [20, 21, 22, 23],
      [8, 9, 10, 11],
    ]);
  });

  it('clamps the slab at the volume edges', () => {
    const volume = makeVolume('f32');
    // Asking for a huge slab at slice 0 must not read outside the volume.
    const wide = grayOf(volume, 'coronal', 0, 99);
    const full = grayOf(volume, 'coronal', 1, 1);
    expect(wide).toEqual(full);
  });

  it('matches the plain slice when the slab is zero', () => {
    const volume = makeVolume('f32');
    expect(grayOf(volume, 'axial', 1, 0)).toEqual(grayOf(volume, 'axial', 1));
  });
});

describe('cache', () => {
  it('returns the identical image object for a repeated request', () => {
    const volume = makeVolume('f32');
    const first = extractSliceGrayImage(volume, 'axial', 1, IDENTITY_WL);
    expect(extractSliceGrayImage(volume, 'axial', 1, IDENTITY_WL)).toBe(first);
  });

  it('does not serve one window/level from another', () => {
    const volume = makeVolume('f32');
    const a = extractSliceGrayImage(volume, 'axial', 1, { window: 255, level: 127.5 });
    const b = extractSliceGrayImage(volume, 'axial', 1, { window: 20, level: 14 });
    expect(a).not.toBe(b);
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });

  it('does not serve one plane or slice from another', () => {
    const volume = makeVolume('f32');
    const axial0 = extractSliceGrayImage(volume, 'axial', 0, IDENTITY_WL);
    const axial1 = extractSliceGrayImage(volume, 'axial', 1, IDENTITY_WL);
    expect(axial0).not.toBe(axial1);
    expect(extractSliceGrayImage(volume, 'coronal', 0, IDENTITY_WL)).not.toBe(axial0);
  });
});
