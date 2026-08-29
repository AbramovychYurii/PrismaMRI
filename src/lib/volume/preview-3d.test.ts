import { MAX_3D_TEXTURE_EDGE } from '@/constants';
import { prepareVolumeFor3D } from '@/lib/volume/preview-3d';
import type { LoadedVolume, Vec3 } from '@/types';
import { describe, expect, it } from 'vitest';

function makeVolume(dims: Vec3, fill: (x: number, y: number, z: number) => number): LoadedVolume {
  const [sx, sy, sz] = dims;
  const voxels = new Float32Array(sx * sy * sz);
  for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++) voxels[x + sx * (y + sy * z)] = fill(x, y, z);
  return {
    voxels,
    meta: { dims, spacing: [1, 1, 1], origin: [0, 0, 0], bitsAllocated: 16 },
    scalarMin: 0,
    scalarMax: 1,
    windowLevel: { window: 1, level: 0.5 },
    formatId: 'nrrd',
  };
}

/** Physical extent of the texture along each axis, in millimetres. */
function worldExtent(dims: Vec3, spacing: Vec3): Vec3 {
  return [dims[0] * spacing[0], dims[1] * spacing[1], dims[2] * spacing[2]];
}

describe('texture sizing', () => {
  it('leaves a volume that already fits completely alone', () => {
    const p = prepareVolumeFor3D(makeVolume([8, 6, 4], () => 1));
    expect(p.dims).toEqual([8, 6, 4]);
    expect(p.spacing).toEqual([1, 1, 1]);
  });

  it('caps each axis on its own instead of shrinking all three', () => {
    // A tall stack used to lose its in-plane detail purely for being tall:
    // one global stride of 2 turned 512×512 slices into 256×256.
    const cap = MAX_3D_TEXTURE_EDGE;
    const p = prepareVolumeFor3D(makeVolume([cap, 4, cap * 2], () => 1));
    // x sits exactly at the cap and must survive untouched despite z being
    // twice as long; y is nowhere near the cap and must not move at all.
    expect(p.dims).toEqual([cap, 4, cap]);
  });

  it('does not fall off a cliff one voxel over the cap', () => {
    // The old ceil() stride sent an edge of cap+1 all the way down to cap/2.
    const p = prepareVolumeFor3D(makeVolume([MAX_3D_TEXTURE_EDGE + 1, 4, 4], () => 1));
    expect(p.dims[0]).toBe(MAX_3D_TEXTURE_EDGE);
    expect(p.dims[1]).toBe(4);
    expect(p.dims[2]).toBe(4);
  });

  it('never exceeds the edge cap', () => {
    for (const dims of [
      [MAX_3D_TEXTURE_EDGE * 3, 2, 2],
      [2, MAX_3D_TEXTURE_EDGE + 7, 2],
      [600, 4, 800],
    ] as Vec3[]) {
      const p = prepareVolumeFor3D(makeVolume(dims, () => 1));
      for (const d of p.dims) expect(d).toBeLessThanOrEqual(MAX_3D_TEXTURE_EDGE);
    }
  });

  it('reports the untouched source dims for cursor mapping', () => {
    const dims: Vec3 = [MAX_3D_TEXTURE_EDGE * 2, 3, 3];
    expect(prepareVolumeFor3D(makeVolume(dims, () => 1)).sourceDims).toEqual(dims);
  });
});

describe('physical extent', () => {
  it('keeps the volume the same size in millimetres after resampling', () => {
    // Spacing has to grow by exactly the reduction ratio, or the model changes
    // shape — and every measurement drawn on it changes with it.
    const dims: Vec3 = [MAX_3D_TEXTURE_EDGE * 2, MAX_3D_TEXTURE_EDGE, 4];
    const volume = makeVolume(dims, () => 1);
    volume.meta.spacing = [0.5, 0.75, 3];
    const p = prepareVolumeFor3D(volume);
    expect(worldExtent(p.dims, p.spacing)).toEqual(worldExtent(dims, [0.5, 0.75, 3]));
  });

  it('holds for a non-integer reduction ratio too', () => {
    const dims: Vec3 = [MAX_3D_TEXTURE_EDGE + 1, 4, 4];
    const volume = makeVolume(dims, () => 1);
    volume.meta.spacing = [0.4, 1, 1];
    const p = prepareVolumeFor3D(volume);
    const [wx] = worldExtent(p.dims, p.spacing);
    expect(wx).toBeCloseTo(dims[0] * 0.4, 6);
  });
});

describe('box sampling', () => {
  it('keeps a one-voxel bright structure that point sampling would drop', () => {
    // This is the whole point. A single bright voxel sitting off the old
    // sampling lattice used to disappear from the 3-D model entirely.
    const n = MAX_3D_TEXTURE_EDGE * 2;
    const bright: Vec3 = [3, 1, 1]; // odd x — never hit by a stride-2 corner sample
    const volume = makeVolume([n, 4, 4], (x, y, z) =>
      x === bright[0] && y === bright[1] && z === bright[2] ? 1000 : 0,
    );
    const p = prepareVolumeFor3D(volume);
    expect(Math.max(...p.data)).toBe(255);
  });

  it('finds the peak wherever it sits inside the box', () => {
    // Every position within a 2×1×1 box must survive, not just the corner.
    const n = MAX_3D_TEXTURE_EDGE * 2;
    for (const x of [0, 1, 2, 3, n - 2, n - 1]) {
      const volume = makeVolume([n, 2, 2], (vx) => (vx === x ? 500 : 0));
      expect(Math.max(...prepareVolumeFor3D(volume).data)).toBe(255);
    }
  });

  it('takes the maximum of the box, not its first member', () => {
    // Exactly two source voxels per box, bright only on odd x. Every box's
    // first member is even, so corner sampling yields an entirely dark
    // texture while a box maximum yields an entirely bright one.
    const n = MAX_3D_TEXTURE_EDGE * 2;
    const volume = makeVolume([n, 1, 1], (x) => (x % 2 === 1 ? 1000 : 0));
    const p = prepareVolumeFor3D(volume);
    expect(p.dims[0]).toBe(MAX_3D_TEXTURE_EDGE);
    expect(Array.from(p.data).every((v) => v === 255)).toBe(true);
  });

  it('covers every source voxel exactly once across the boxes', () => {
    // A gap would silently hide data; an overlap would double-count it. Both
    // show up as a missing maximum when each voxel is uniquely bright.
    const n = MAX_3D_TEXTURE_EDGE + 3;
    const volume = makeVolume([n, 1, 1], (x) => x);
    const p = prepareVolumeFor3D(volume);
    // The global maximum lives in the last box and must survive.
    expect(p.data[p.dims[0] - 1]).toBe(255);
    // Output must rise monotonically, since the source does.
    for (let i = 1; i < p.dims[0]; i++) expect(p.data[i]).toBeGreaterThanOrEqual(p.data[i - 1]);
  });

  it('reduces along y and z, not only x', () => {
    const cap = MAX_3D_TEXTURE_EDGE;
    for (const axis of [1, 2]) {
      const dims: Vec3 = [2, 2, 2];
      dims[axis] = cap * 2;
      const bright: Vec3 = [1, 1, 1];
      bright[axis] = 3;
      const volume = makeVolume(dims, (x, y, z) =>
        x === bright[0] && y === bright[1] && z === bright[2] ? 700 : 0,
      );
      const p = prepareVolumeFor3D(volume);
      expect(p.dims[axis]).toBe(cap);
      expect(Math.max(...p.data)).toBe(255);
    }
  });
});

describe('progress reporting', () => {
  it('runs monotonically to 1', () => {
    const seen: number[] = [];
    prepareVolumeFor3D(
      makeVolume([8, 8, 8], () => 1),
      undefined,
      (r) => seen.push(r),
    );
    expect(seen[seen.length - 1]).toBeCloseTo(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
  });
});
