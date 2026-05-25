import { buildInt16WLLut, grayToRgba, mapIntensityToGray } from '@/lib/volume/math';
import type { LoadedVolume, SliceImage, SlicePlane, SliceWindowLevel } from '@/types';

const MAX_CACHE = 64;

interface CacheEntry {
  order: string[];
  map: Map<string, SliceImage>;
  lut: Uint8Array | null;
  lutWindow: number;
  lutLevel: number;
}

const cache = new WeakMap<LoadedVolume, CacheEntry>();

function cacheKey(plane: SlicePlane, index: number, wl: SliceWindowLevel, halfSlabs = 0): string {
  return `${plane}:${index}:${wl.window.toFixed(2)}:${wl.level.toFixed(2)}:s${halfSlabs}`;
}

function getEntry(volume: LoadedVolume): CacheEntry {
  let e = cache.get(volume);
  if (!e) {
    e = { order: [], map: new Map(), lut: null, lutWindow: Number.NaN, lutLevel: Number.NaN };
    cache.set(volume, e);
  }
  return e;
}

/** Returns a cached Int16 LUT for this volume+WL, rebuilding only when WL changes. */
function getLut(volume: LoadedVolume, wl: SliceWindowLevel): Uint8Array | null {
  if (!(volume.voxels instanceof Int16Array)) return null;
  const e = getEntry(volume);
  if (e.lut && e.lutWindow === wl.window && e.lutLevel === wl.level) return e.lut;
  e.lut = buildInt16WLLut(wl);
  e.lutWindow = wl.window;
  e.lutLevel = wl.level;
  return e.lut;
}

function store(volume: LoadedVolume, key: string, img: SliceImage): SliceImage {
  const e = getEntry(volume);
  e.map.set(key, img);
  e.order.push(key);
  if (e.order.length > MAX_CACHE) {
    const evict = e.order.shift();
    if (evict) e.map.delete(evict);
  }
  return img;
}

/** Axial: XY plane at fixed z. width = dimX, height = dimY. */
export function extractAxialImage(
  volume: LoadedVolume,
  z: number,
  wl: SliceWindowLevel,
): SliceImage {
  const [w, h] = volume.meta.dims;
  const data = new Uint8ClampedArray(w * h * 4);
  const base = w * h * z;
  const vox = volume.voxels;
  const lut = getLut(volume, wl);
  const total = w * h;
  if (lut) {
    for (let i = 0; i < total; i++) {
      const g = lut[(vox[base + i] as number) + 32768];
      const o = i * 4;
      data[o] = data[o + 1] = data[o + 2] = g;
      data[o + 3] = 255;
    }
  } else {
    for (let i = 0; i < total; i++) {
      grayToRgba(mapIntensityToGray(vox[base + i], wl), data, i * 4);
    }
  }
  return { width: w, height: h, data };
}

/**
 * Coronal: XZ plane at fixed y. width = dimX, height = dimZ.
 * z iterates from depth-1 down to 0 so the head is up (anatomical).
 */
export function extractCoronalImage(
  volume: LoadedVolume,
  y: number,
  wl: SliceWindowLevel,
): SliceImage {
  const [w, h, d] = volume.meta.dims;
  const data = new Uint8ClampedArray(w * d * 4);
  const vox = volume.voxels;
  const lut = getLut(volume, wl);
  for (let row = 0; row < d; row++) {
    const base = w * (y + h * (d - 1 - row));
    const dstRow = w * row;
    if (lut) {
      for (let x = 0; x < w; x++) {
        const g = lut[(vox[base + x] as number) + 32768];
        const o = (dstRow + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = g;
        data[o + 3] = 255;
      }
    } else {
      for (let x = 0; x < w; x++) {
        grayToRgba(mapIntensityToGray(vox[base + x], wl), data, (dstRow + x) * 4);
      }
    }
  }
  return { width: w, height: d, data };
}

/**
 * Sagittal: YZ plane at fixed x. width = dimY, height = dimZ.
 * z iterates from depth-1 down to 0 (anatomical).
 */
export function extractSagittalImage(
  volume: LoadedVolume,
  x: number,
  wl: SliceWindowLevel,
): SliceImage {
  const [w, h, d] = volume.meta.dims;
  const data = new Uint8ClampedArray(h * d * 4);
  const vox = volume.voxels;
  const lut = getLut(volume, wl);
  for (let row = 0; row < d; row++) {
    const zBase = w * h * (d - 1 - row);
    const dstRow = h * row;
    if (lut) {
      for (let y = 0; y < h; y++) {
        const g = lut[(vox[x + w * y + zBase] as number) + 32768];
        const o = (dstRow + y) * 4;
        data[o] = data[o + 1] = data[o + 2] = g;
        data[o + 3] = 255;
      }
    } else {
      for (let y = 0; y < h; y++) {
        grayToRgba(mapIntensityToGray(vox[x + w * y + zBase], wl), data, (dstRow + y) * 4);
      }
    }
  }
  return { width: h, height: d, data };
}

// ── Slab MIP helpers ───────────────────────────────────────────────────────

/**
 * Module-level reusable accumulation buffer for slab MIP.
 * Avoids allocating a fresh Float32Array (up to ~1 MB for 512×512) on every
 * scroll tick, which would cause heavy GC pressure at 60 fps.
 * Safe because JS is single-threaded — each call completes before the next.
 */
let _mipBuf: Float32Array | null = null;
function getMipBuf(size: number): Float32Array {
  if (!_mipBuf || _mipBuf.length < size) {
    _mipBuf = new Float32Array(size);
  }
  _mipBuf.fill(Number.NEGATIVE_INFINITY, 0, size);
  return _mipBuf;
}

/**
 * Maximum Intensity Projection across a slab of `halfSlabs` slices on each
 * side of `centerIndex`. Per-pixel max is computed in raw scalar space before
 * the W/L LUT is applied, so the result faithfully represents peak intensity.
 */
export function extractSlabMipImage(
  volume: LoadedVolume,
  plane: SlicePlane,
  centerIndex: number,
  halfSlabs: number,
  wl: SliceWindowLevel,
): SliceImage {
  const [w, h, d] = volume.meta.dims;
  const vox = volume.voxels;
  const lut = getLut(volume, wl);

  if (plane === 'axial') {
    const z0 = Math.max(0, centerIndex - halfSlabs);
    const z1 = Math.min(d - 1, centerIndex + halfSlabs);
    const total = w * h;
    const maxVals = getMipBuf(total);
    for (let z = z0; z <= z1; z++) {
      const base = w * h * z;
      for (let i = 0; i < total; i++) {
        const v = vox[base + i] as number;
        if (v > maxVals[i]) maxVals[i] = v;
      }
    }
    const data = new Uint8ClampedArray(total * 4);
    if (lut) {
      for (let i = 0; i < total; i++) {
        const g = lut[Math.round(maxVals[i]) + 32768];
        const o = i * 4;
        data[o] = data[o + 1] = data[o + 2] = g;
        data[o + 3] = 255;
      }
    } else {
      for (let i = 0; i < total; i++) {
        grayToRgba(mapIntensityToGray(maxVals[i], wl), data, i * 4);
      }
    }
    return { width: w, height: h, data };
  }

  if (plane === 'coronal') {
    const y0 = Math.max(0, centerIndex - halfSlabs);
    const y1 = Math.min(h - 1, centerIndex + halfSlabs);
    const total = w * d;
    const maxVals = getMipBuf(total);
    for (let y = y0; y <= y1; y++) {
      for (let row = 0; row < d; row++) {
        const base = w * (y + h * (d - 1 - row));
        const dstRow = w * row;
        for (let x = 0; x < w; x++) {
          const v = vox[base + x] as number;
          const idx = dstRow + x;
          if (v > maxVals[idx]) maxVals[idx] = v;
        }
      }
    }
    const data = new Uint8ClampedArray(total * 4);
    if (lut) {
      for (let i = 0; i < total; i++) {
        const g = lut[Math.round(maxVals[i]) + 32768];
        const o = i * 4;
        data[o] = data[o + 1] = data[o + 2] = g;
        data[o + 3] = 255;
      }
    } else {
      for (let i = 0; i < total; i++) {
        grayToRgba(mapIntensityToGray(maxVals[i], wl), data, i * 4);
      }
    }
    return { width: w, height: d, data };
  }

  // sagittal
  const x0 = Math.max(0, centerIndex - halfSlabs);
  const x1 = Math.min(w - 1, centerIndex + halfSlabs);
  const total = h * d;
  const maxVals = getMipBuf(total);
  for (let x = x0; x <= x1; x++) {
    for (let row = 0; row < d; row++) {
      const zBase = w * h * (d - 1 - row);
      const dstRow = h * row;
      for (let y = 0; y < h; y++) {
        const v = vox[x + w * y + zBase] as number;
        const idx = dstRow + y;
        if (v > maxVals[idx]) maxVals[idx] = v;
      }
    }
  }
  const data = new Uint8ClampedArray(total * 4);
  if (lut) {
    for (let i = 0; i < total; i++) {
      const g = lut[Math.round(maxVals[i]) + 32768];
      const o = i * 4;
      data[o] = data[o + 1] = data[o + 2] = g;
      data[o + 3] = 255;
    }
  } else {
    for (let i = 0; i < total; i++) {
      grayToRgba(mapIntensityToGray(maxVals[i], wl), data, i * 4);
    }
  }
  return { width: h, height: d, data };
}

export function extractSliceGrayImage(
  volume: LoadedVolume,
  plane: SlicePlane,
  index: number,
  wl: SliceWindowLevel,
  halfSlabs = 0,
): SliceImage {
  const key = cacheKey(plane, index, wl, halfSlabs);
  const e = getEntry(volume);
  const hit = e.map.get(key);
  if (hit) return hit;
  let img: SliceImage;
  if (halfSlabs > 0) {
    img = extractSlabMipImage(volume, plane, index, halfSlabs, wl);
  } else if (plane === 'axial') {
    img = extractAxialImage(volume, index, wl);
  } else if (plane === 'coronal') {
    img = extractCoronalImage(volume, index, wl);
  } else {
    img = extractSagittalImage(volume, index, wl);
  }
  return store(volume, key, img);
}
