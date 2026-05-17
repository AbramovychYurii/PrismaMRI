import type { SliceWindowLevel } from '@/types';

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Map a scalar intensity to 0..255 grayscale using window/level. */
export function mapIntensityToGray(value: number, wl: SliceWindowLevel): number {
  const lower = wl.level - wl.window / 2;
  if (wl.window <= 0) return value <= lower ? 0 : 255;
  const t = (value - lower) / wl.window;
  return clamp(Math.round(t * 255), 0, 255);
}

/**
 * Precompute a W/L → gray lookup table for Int16 voxels (65 536 entries).
 * Hot-path usage: lut[rawInt16 + 32768] — one addition, zero division.
 */
export function buildInt16WLLut(wl: SliceWindowLevel): Uint8Array {
  const lut = new Uint8Array(65536);
  const lower = wl.level - wl.window / 2;
  if (wl.window <= 0) {
    for (let i = 0; i < 65536; i++) lut[i] = i - 32768 <= lower ? 0 : 255;
  } else {
    const invW = 255 / wl.window;
    for (let i = 0; i < 65536; i++) {
      const t = (i - 32768 - lower) * invW;
      lut[i] = t <= 0 ? 0 : t >= 255 ? 255 : (t + 0.5) | 0;
    }
  }
  return lut;
}

/** Write an RGBA pixel (opaque gray) into `out` at byte offset `o`. */
export function grayToRgba(gray: number, out: Uint8ClampedArray, o: number): void {
  out[o] = gray;
  out[o + 1] = gray;
  out[o + 2] = gray;
  out[o + 3] = 255;
}

export function mapIntensityToRgba(
  value: number,
  wl: SliceWindowLevel,
  out: Uint8ClampedArray,
  o: number,
): void {
  grayToRgba(mapIntensityToGray(value, wl), out, o);
}

/**
 * Resolve a sensible default window/level from a scalar range, or honor
 * explicit DICOM-supplied center/width when present.
 */
export function resolveWindowLevel(
  scalarMin: number,
  scalarMax: number,
  explicitCenter?: number,
  explicitWidth?: number,
): SliceWindowLevel {
  const range = scalarMax - scalarMin;
  if (
    explicitCenter !== undefined &&
    explicitWidth !== undefined &&
    Number.isFinite(explicitCenter) &&
    Number.isFinite(explicitWidth) &&
    explicitWidth > 0
  ) {
    // Honor explicit DICOM window only if it actually overlaps the data
    // range. Synthetic / mis-tagged series sometimes carry a window that
    // sits entirely outside the pixels, which would render an all-black
    // slice — fall back to a data-derived window in that case.
    const lo = explicitCenter - explicitWidth / 2;
    const hi = explicitCenter + explicitWidth / 2;
    if (hi >= scalarMin && lo <= scalarMax) {
      return { window: explicitWidth, level: explicitCenter };
    }
  }
  return {
    window: range > 0 ? range : 1,
    level: scalarMin + range / 2,
  };
}
