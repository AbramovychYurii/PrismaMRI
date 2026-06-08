import { MAX_3D_TEXTURE_EDGE } from '@/constants';
import type { LoadedVolume, PreparedVolumeFor3D, Vec3 } from '@/types';
import {
  type ScalarHistogram,
  type SubProgressFn,
  buildScalarHistogram,
  resolveIsoThreshold,
  resolveScalarRange,
} from '@/workers/volume/scalars';

function downsampleStride(dims: Vec3): number {
  const maxEdge = Math.max(dims[0], dims[1], dims[2]);
  return maxEdge <= MAX_3D_TEXTURE_EDGE ? 1 : Math.ceil(maxEdge / MAX_3D_TEXTURE_EDGE);
}

/**
 * Quantize the float volume to a Uint8 Data3DTexture payload, downsampling
 * oversized volumes so the largest edge fits in `MAX_3D_TEXTURE_EDGE`.
 */
export function prepareVolumeFor3D(
  volume: LoadedVolume,
  prebuiltHist?: ScalarHistogram,
  onProgress?: SubProgressFn,
): PreparedVolumeFor3D {
  const [sx, sy, sz] = volume.meta.dims;
  const stride = downsampleStride(volume.meta.dims);

  const dx = Math.max(1, Math.floor(sx / stride));
  const dy = Math.max(1, Math.floor(sy / stride));
  const dz = Math.max(1, Math.floor(sz / stride));

  const hist = prebuiltHist ?? buildScalarHistogram(volume.voxels, 1024);
  const [lo, hi] = resolveScalarRange(hist);
  const span = hi - lo || 1;
  const threshold = resolveIsoThreshold(hist, [lo, hi]);

  // Quantization is the dominant cost here — emit progress every slice along z.
  // dz is at most MAX_3D_TEXTURE_EDGE (≈256) so this is ≤256 ticks; the actual
  // worker further reduces by mapping the ratio onto a 0..1 sub-range.
  const out = new Uint8Array(dx * dy * dz);
  const src = volume.voxels;
  let o = 0;
  for (let z = 0; z < dz; z++) {
    const sZ = z * stride;
    for (let y = 0; y < dy; y++) {
      const sY = y * stride;
      for (let x = 0; x < dx; x++) {
        const sIdx = x * stride + sx * (sY + sy * sZ);
        const t = (src[sIdx] - lo) / span;
        out[o++] = t <= 0 ? 0 : t >= 1 ? 255 : (t * 255) | 0;
      }
    }
    onProgress?.((z + 1) / dz);
  }

  const spacing: Vec3 = [
    volume.meta.spacing[0] * stride,
    volume.meta.spacing[1] * stride,
    volume.meta.spacing[2] * stride,
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
