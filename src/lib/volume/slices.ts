import { buildInt16WLLut, grayToRgba, mapIntensityToGray } from '@/lib/volume/math';
import { sliceCount } from '@/lib/volume/plane';
import type { LoadedVolume, SliceImage, SlicePlane, SliceWindowLevel } from '@/types';

/**
 * Byte budget for cached slice images, per volume.
 *
 * Counting entries made the cache's cost depend on the study rather than on
 * the budget: 64 slices of a 256³ volume is 16 MB, but 64 coronal slices of a
 * 512×512×996 study is ~130 MB — on top of ~500 MB of voxels and a 3-D texture
 * that can itself reach 134 MB.
 *
 * Budgeting bytes cuts both ways, which is the point: it caps the large study
 * and, for a small one, caches several times more slices than 64 ever did.
 */
export const MAX_CACHE_BYTES = 48 * 1024 * 1024;

interface CacheEntry {
  order: string[];
  map: Map<string, SliceImage>;
  /** Sum of `data.byteLength` over `map`, tracked so eviction needs no scan. */
  bytes: number;
  lut: Uint8Array | null;
  lutWindow: number;
  lutLevel: number;
}

const cache = new WeakMap<LoadedVolume, CacheEntry>();

function cacheKey(plane: SlicePlane, index: number, wl: SliceWindowLevel, halfSlabs = 0): string {
  return `${plane}:${index}:${wl.window.toFixed(2)}:${wl.level.toFixed(2)}:s${halfSlabs}`;
}

function getEntry(volume: LoadedVolume): CacheEntry {
  let entry = cache.get(volume);
  if (!entry) {
    entry = {
      order: [],
      map: new Map(),
      bytes: 0,
      lut: null,
      lutWindow: Number.NaN,
      lutLevel: Number.NaN,
    };
    cache.set(volume, entry);
  }
  return entry;
}

/** Cached Int16 W/L lookup table, rebuilt only when the window or level changes. */
function getLut(volume: LoadedVolume, wl: SliceWindowLevel): Uint8Array | null {
  if (!(volume.voxels instanceof Int16Array)) return null;
  const entry = getEntry(volume);
  if (entry.lut && entry.lutWindow === wl.window && entry.lutLevel === wl.level) return entry.lut;
  entry.lut = buildInt16WLLut(wl);
  entry.lutWindow = wl.window;
  entry.lutLevel = wl.level;
  return entry.lut;
}

function store(volume: LoadedVolume, key: string, image: SliceImage): SliceImage {
  const entry = getEntry(volume);
  entry.map.set(key, image);
  entry.order.push(key);
  entry.bytes += image.data.byteLength;

  // The image just stored is the one on screen, so it is never the one evicted
  // — even for a study whose single slice is larger than the whole budget.
  while (entry.bytes > MAX_CACHE_BYTES && entry.order.length > 1) {
    const oldest = entry.order.shift();
    if (oldest === undefined) break;
    const dropped = entry.map.get(oldest);
    if (dropped) entry.bytes -= dropped.data.byteLength;
    entry.map.delete(oldest);
  }
  return image;
}

/**
 * How a plane's pixels map onto the linear voxel buffer. Rows of the coronal
 * and sagittal images run bottom-up so anatomy stays head-up, which is why
 * their `rowStart` walks backwards through z.
 */
interface SliceLayout {
  width: number;
  height: number;
  /** Voxel index of the leftmost pixel of `row` within slice `index`. */
  rowStart(index: number, row: number): number;
  /** Voxel-index step between horizontally adjacent pixels. */
  columnStep: number;
}

function sliceLayout(plane: SlicePlane, dims: readonly [number, number, number]): SliceLayout {
  const [w, h, d] = dims;
  const sliceStride = w * h;
  if (plane === 'axial') {
    return {
      width: w,
      height: h,
      rowStart: (z, row) => sliceStride * z + w * row,
      columnStep: 1,
    };
  }
  if (plane === 'coronal') {
    return {
      width: w,
      height: d,
      rowStart: (y, row) => w * y + sliceStride * (d - 1 - row),
      columnStep: 1,
    };
  }
  return {
    width: h,
    height: d,
    rowStart: (x, row) => x + sliceStride * (d - 1 - row),
    columnStep: w,
  };
}

/** Applies W/L to a plane of raw scalars, writing opaque grayscale RGBA. */
function scalarsToRgba(
  scalars: ArrayLike<number>,
  count: number,
  lut: Uint8Array | null,
  wl: SliceWindowLevel,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4);
  if (lut) {
    for (let i = 0; i < count; i++) grayToRgba(lut[Math.round(scalars[i]) + 32768], data, i * 4);
  } else {
    for (let i = 0; i < count; i++) grayToRgba(mapIntensityToGray(scalars[i], wl), data, i * 4);
  }
  return data;
}

function extractPlaneImage(
  volume: LoadedVolume,
  plane: SlicePlane,
  index: number,
  wl: SliceWindowLevel,
): SliceImage {
  const { width, height, rowStart, columnStep } = sliceLayout(plane, volume.meta.dims);
  const voxels = volume.voxels;
  const lut = getLut(volume, wl);
  const data = new Uint8ClampedArray(width * height * 4);

  for (let row = 0; row < height; row++) {
    const base = rowStart(index, row);
    const dst = row * width;
    if (lut) {
      for (let col = 0; col < width; col++) {
        grayToRgba(lut[(voxels[base + col * columnStep] as number) + 32768], data, (dst + col) * 4);
      }
    } else {
      for (let col = 0; col < width; col++) {
        grayToRgba(mapIntensityToGray(voxels[base + col * columnStep], wl), data, (dst + col) * 4);
      }
    }
  }

  return { width, height, data };
}

/**
 * Reusable accumulation buffer for slab MIP — a fresh Float32Array per scroll
 * tick (up to ~1 MB) would dominate GC at 60 fps. Safe because each call runs
 * to completion on the single JS thread.
 */
let mipBuffer: Float32Array | null = null;

function takeMipBuffer(size: number): Float32Array {
  if (!mipBuffer || mipBuffer.length < size) mipBuffer = new Float32Array(size);
  mipBuffer.fill(Number.NEGATIVE_INFINITY, 0, size);
  return mipBuffer;
}

/**
 * Maximum Intensity Projection across `halfSlabs` slices either side of
 * `centerIndex`. The per-pixel maximum is taken in raw scalar space before W/L
 * is applied, so the result reflects true peak intensity.
 */
export function extractSlabMipImage(
  volume: LoadedVolume,
  plane: SlicePlane,
  centerIndex: number,
  halfSlabs: number,
  wl: SliceWindowLevel,
): SliceImage {
  const dims = volume.meta.dims;
  const { width, height, rowStart, columnStep } = sliceLayout(plane, dims);
  const voxels = volume.voxels;
  const total = width * height;
  const peaks = takeMipBuffer(total);

  const first = Math.max(0, centerIndex - halfSlabs);
  const last = Math.min(sliceCount(dims, plane) - 1, centerIndex + halfSlabs);

  for (let index = first; index <= last; index++) {
    for (let row = 0; row < height; row++) {
      const base = rowStart(index, row);
      const dst = row * width;
      for (let col = 0; col < width; col++) {
        const value = voxels[base + col * columnStep] as number;
        if (value > peaks[dst + col]) peaks[dst + col] = value;
      }
    }
  }

  return { width, height, data: scalarsToRgba(peaks, total, getLut(volume, wl), wl) };
}

export function extractSliceGrayImage(
  volume: LoadedVolume,
  plane: SlicePlane,
  index: number,
  wl: SliceWindowLevel,
  halfSlabs = 0,
): SliceImage {
  const key = cacheKey(plane, index, wl, halfSlabs);
  const cached = getEntry(volume).map.get(key);
  if (cached) return cached;

  const image =
    halfSlabs > 0
      ? extractSlabMipImage(volume, plane, index, halfSlabs, wl)
      : extractPlaneImage(volume, plane, index, wl);
  return store(volume, key, image);
}
