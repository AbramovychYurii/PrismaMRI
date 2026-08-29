import { MAX_3D_TEXTURE_EDGE } from '@/constants';
import type { LoadedVolume, PreparedVolumeFor3D, Vec3 } from '@/types';
import {
  type ScalarHistogram,
  type SubProgressFn,
  buildScalarHistogram,
  resolveIsoThreshold,
  resolveScalarRange,
} from '@/workers/volume/scalars';

/**
 * Texture size per axis: as close to the source as the edge cap allows.
 *
 * Each axis is capped on its own rather than all three being driven by the
 * longest edge. Driving them together punished short axes for a neighbour's
 * length — a 512×512×996 study had its perfectly-sized 512×512 slices halved
 * to 256×256 purely because it was tall. It also produced a cliff at the cap:
 * a 513-voxel edge fell to 256, throwing away half the resolution to clear a
 * limit it missed by one voxel.
 *
 * The trade is texture memory: volumes that used to be shrunk uniformly now
 * keep more detail and so occupy more of it. The ceiling is unchanged — a
 * 512³ source already produced a full-size texture before this — but more
 * volumes now reach it. `MAX_3D_TEXTURE_EDGE` is the knob if that ever needs
 * trading back.
 */
function targetDims([sx, sy, sz]: Vec3): Vec3 {
  return [
    Math.min(sx, MAX_3D_TEXTURE_EDGE),
    Math.min(sy, MAX_3D_TEXTURE_EDGE),
    Math.min(sz, MAX_3D_TEXTURE_EDGE),
  ];
}

/**
 * Source offsets that split `sourceLen` into `targetLen` contiguous boxes:
 * output voxel `i` covers source `[bounds[i], bounds[i + 1])`.
 *
 * Precomputed per axis so the sampling loop does no division, and expressed as
 * bounds rather than a fixed stride so a non-integer ratio (513 → 512) works
 * without a special case — the boxes simply differ in width by one.
 */
function boxBounds(sourceLen: number, targetLen: number): Int32Array {
  const bounds = new Int32Array(targetLen + 1);
  for (let i = 0; i <= targetLen; i++) bounds[i] = Math.floor((i * sourceLen) / targetLen);
  return bounds;
}

/**
 * Quantize the volume to a Uint8 Data3DTexture payload, resampling oversized
 * volumes so every edge fits in `MAX_3D_TEXTURE_EDGE`.
 *
 * Each output voxel takes the **maximum** of the source box behind it, not a
 * single sample from its corner. Point sampling discarded 7 of every 8 voxels
 * at a 2× reduction, and what it discarded was biased: a vessel or trabecula
 * one voxel wide simply vanished unless it happened to land on the sampling
 * lattice. Taking the peak is also what makes the MIP preset honest — the
 * maximum of the maxima is the true maximum, so a reduced texture still shows
 * the brightest structure along each ray.
 *
 * The cost is that the DVR presets (tissue / bone) read slightly brighter,
 * since a box never contributes less than its mean. For homogeneous tissue the
 * two barely differ; where they do differ is exactly at a sharp feature, which
 * is the thing worth keeping.
 */
export function prepareVolumeFor3D(
  volume: LoadedVolume,
  prebuiltHist?: ScalarHistogram,
  onProgress?: SubProgressFn,
): PreparedVolumeFor3D {
  const [sx, sy, sz] = volume.meta.dims;
  const [dx, dy, dz] = targetDims(volume.meta.dims);

  const hist = prebuiltHist ?? buildScalarHistogram(volume.voxels, 1024);
  const [lo, hi] = resolveScalarRange(hist);
  const span = hi - lo || 1;
  const threshold = resolveIsoThreshold(hist, [lo, hi]);

  const xs = boxBounds(sx, dx);
  const ys = boxBounds(sy, dy);
  const zs = boxBounds(sz, dz);

  // Resampling is the dominant cost here — emit progress every slice along z.
  // dz is at most MAX_3D_TEXTURE_EDGE so this is ≤512 ticks; the worker further
  // reduces it by mapping the ratio onto a 0..1 sub-range.
  const out = new Uint8Array(dx * dy * dz);
  const src = volume.voxels;
  let o = 0;
  for (let z = 0; z < dz; z++) {
    const z0 = zs[z];
    const z1 = zs[z + 1];
    for (let y = 0; y < dy; y++) {
      const y0 = ys[y];
      const y1 = ys[y + 1];
      for (let x = 0; x < dx; x++) {
        const x0 = xs[x];
        const x1 = xs[x + 1];

        // Peak of the raw scalars, quantised once afterwards. Quantisation is
        // monotonic, so this matches taking the max of the quantised values
        // while doing the arithmetic a box at a time instead of a voxel.
        let peak = Number.NEGATIVE_INFINITY;
        for (let zz = z0; zz < z1; zz++) {
          for (let yy = y0; yy < y1; yy++) {
            const rowBase = sx * (yy + sy * zz);
            for (let xx = x0; xx < x1; xx++) {
              const value = src[rowBase + xx];
              if (value > peak) peak = value;
            }
          }
        }

        const t = (peak - lo) / span;
        out[o++] = t <= 0 ? 0 : t >= 1 ? 255 : (t * 255) | 0;
      }
    }
    onProgress?.((z + 1) / dz);
  }

  // Boxes stand in for the source they cover, so the world-space extent of the
  // texture has to stay identical: each axis grows by its own reduction ratio.
  const spacing: Vec3 = [
    volume.meta.spacing[0] * (dx > 0 ? sx / dx : 1),
    volume.meta.spacing[1] * (dy > 0 ? sy / dy : 1),
    volume.meta.spacing[2] * (dz > 0 ? sz / dz : 1),
  ];

  return {
    data: out,
    dims: [dx, dy, dz],
    spacing,
    clim: [0, 255],
    threshold,
    sourceRange: [lo, hi],
    sourceDims: [sx, sy, sz],
  };
}
