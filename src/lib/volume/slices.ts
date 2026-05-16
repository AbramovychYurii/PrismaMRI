import type { LoadedVolume, SliceImage, SlicePlane, SliceWindowLevel } from '@/types';
import { mapIntensityToGray, grayToRgba } from '@/lib/volume/math';

const MAX_CACHE = 64;

interface CacheEntry {
  order: string[];
  map: Map<string, SliceImage>;
}

const cache = new WeakMap<LoadedVolume, CacheEntry>();

function cacheKey(plane: SlicePlane, index: number, wl: SliceWindowLevel): string {
  return `${plane}:${index}:${wl.window.toFixed(2)}:${wl.level.toFixed(2)}`;
}

function getEntry(volume: LoadedVolume): CacheEntry {
  let e = cache.get(volume);
  if (!e) {
    e = { order: [], map: new Map() };
    cache.set(volume, e);
  }
  return e;
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
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = mapIntensityToGray(vox[base + x + w * y], wl);
      grayToRgba(g, data, (x + w * y) * 4);
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
  for (let row = 0; row < d; row++) {
    const z = d - 1 - row;
    const base = w * (y + h * z);
    for (let x = 0; x < w; x++) {
      const g = mapIntensityToGray(vox[base + x], wl);
      grayToRgba(g, data, (x + w * row) * 4);
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
  for (let row = 0; row < d; row++) {
    const z = d - 1 - row;
    for (let y = 0; y < h; y++) {
      const g = mapIntensityToGray(vox[x + w * (y + h * z)], wl);
      grayToRgba(g, data, (y + h * row) * 4);
    }
  }
  return { width: h, height: d, data };
}

export function extractSliceGrayImage(
  volume: LoadedVolume,
  plane: SlicePlane,
  index: number,
  wl: SliceWindowLevel,
): SliceImage {
  const key = cacheKey(plane, index, wl);
  const e = getEntry(volume);
  const hit = e.map.get(key);
  if (hit) return hit;
  let img: SliceImage;
  if (plane === 'axial') img = extractAxialImage(volume, index, wl);
  else if (plane === 'coronal') img = extractCoronalImage(volume, index, wl);
  else img = extractSagittalImage(volume, index, wl);
  return store(volume, key, img);
}
