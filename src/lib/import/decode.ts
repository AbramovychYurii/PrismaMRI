import type { ProgressFn } from '@/lib/import/types';
import type { VoxelArray } from '@/types';

/** Scalar encodings the single-file formats store their voxels in. */
export type ScalarKind = 'i8' | 'u8' | 'i16' | 'u16' | 'i32' | 'u32' | 'f32' | 'f64';

export const SCALAR_BYTES: Record<ScalarKind, number> = {
  i8: 1,
  u8: 1,
  i16: 2,
  u16: 2,
  i32: 4,
  u32: 4,
  f32: 4,
  f64: 8,
};

/**
 * Byte size of `count` voxels of `bytesPerVoxel`, when it is a usable buffer
 * length — a hint for decompressing straight into one buffer, never a check.
 */
export function inflatedSize(count: number, bytesPerVoxel: number): number | undefined {
  const bytes = count * bytesPerVoxel;
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : undefined;
}

/** Voxels decoded between progress ticks: ~64 ticks on a 32M-voxel volume. */
const CHUNK = 1 << 19;

export interface DecodeOptions {
  littleEndian: boolean;
  /** Linear rescale applied to every raw value (NIfTI scl_slope / scl_inter). */
  slope?: number;
  intercept?: number;
}

export interface ScalarRange {
  min: number;
  max: number;
}

/**
 * Decodes `out.length` scalars of `kind` from `view` into `out` as
 * `raw × slope + intercept`, and returns their range, measured on the decoded
 * values before they are stored — so a 32-bit integer source reports its true
 * extremes even where Float32 storage rounds them.
 *
 * Work is reported as `assembling` progress once per chunk. The type switch
 * sits in the chunk loop so every per-voxel loop is a direct, monomorphic
 * DataView call: routing each voxel through a reader function measured ~15 %
 * slower on a 64M-voxel volume.
 */
export function decodeScalars(
  view: DataView,
  kind: ScalarKind,
  out: VoxelArray,
  { littleEndian: le, slope = 1, intercept = 0 }: DecodeOptions,
  onProgress: ProgressFn,
): ScalarRange {
  const count = out.length;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  onProgress({ stage: 'assembling', current: 0, total: count });

  for (let off = 0; off < count; off += CHUNK) {
    const end = Math.min(off + CHUNK, count);
    switch (kind) {
      case 'u8':
        for (let i = off; i < end; i++) {
          const v = view.getUint8(i) * slope + intercept;
          out[i] = v;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        break;
      case 'i8':
        for (let i = off; i < end; i++) {
          const v = view.getInt8(i) * slope + intercept;
          out[i] = v;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        break;
      case 'i16':
        for (let i = off; i < end; i++) {
          const v = view.getInt16(i * 2, le) * slope + intercept;
          out[i] = v;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        break;
      case 'u16':
        for (let i = off; i < end; i++) {
          const v = view.getUint16(i * 2, le) * slope + intercept;
          out[i] = v;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        break;
      case 'i32':
        for (let i = off; i < end; i++) {
          const v = view.getInt32(i * 4, le) * slope + intercept;
          out[i] = v;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        break;
      case 'u32':
        for (let i = off; i < end; i++) {
          const v = view.getUint32(i * 4, le) * slope + intercept;
          out[i] = v;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        break;
      case 'f32':
        for (let i = off; i < end; i++) {
          const v = view.getFloat32(i * 4, le) * slope + intercept;
          out[i] = v;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        break;
      case 'f64':
        for (let i = off; i < end; i++) {
          const v = view.getFloat64(i * 8, le) * slope + intercept;
          out[i] = v;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        break;
    }
    onProgress({ stage: 'assembling', current: end, total: count });
  }
  return { min, max };
}
