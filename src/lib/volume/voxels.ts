import type { LoadedVolume } from '@/types';

/**
 * Read a voxel by integer coordinates. Buffer layout is x-fastest:
 * index = x + width * (y + height * z).
 */
export function getVoxelValue(
  volume: LoadedVolume,
  x: number,
  y: number,
  z: number,
): number {
  const [w, h, d] = volume.meta.dims;
  if (x < 0 || y < 0 || z < 0 || x >= w || y >= h || z >= d) return 0;
  return volume.voxels[x + w * (y + h * z)];
}

export function voxelIndex(
  dims: readonly [number, number, number],
  x: number,
  y: number,
  z: number,
): number {
  return x + dims[0] * (y + dims[1] * z);
}
