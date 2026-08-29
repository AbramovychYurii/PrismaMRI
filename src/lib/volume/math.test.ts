import {
  buildInt16WLLut,
  clamp,
  grayToRgba,
  mapIntensityToGray,
  resolveWindowLevel,
} from '@/lib/volume/math';
import { describe, expect, it } from 'vitest';

describe('clamp', () => {
  it('holds a value inside its bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(0, 0, 0)).toBe(0);
  });
});

describe('mapIntensityToGray', () => {
  const wl = { window: 400, level: 200 }; // covers 0..400

  it('maps the window edges to full black and full white', () => {
    expect(mapIntensityToGray(0, wl)).toBe(0);
    expect(mapIntensityToGray(400, wl)).toBe(255);
  });

  it('puts the level at mid-gray', () => {
    expect(mapIntensityToGray(200, wl)).toBe(128);
  });

  it('clamps outside the window instead of wrapping', () => {
    expect(mapIntensityToGray(-9999, wl)).toBe(0);
    expect(mapIntensityToGray(9999, wl)).toBe(255);
  });

  it('rises monotonically across the window', () => {
    let previous = -1;
    for (let v = 0; v <= 400; v += 5) {
      const gray = mapIntensityToGray(v, wl);
      expect(gray).toBeGreaterThanOrEqual(previous);
      previous = gray;
    }
  });

  it('degenerates to a hard threshold when the window is zero', () => {
    const zero = { window: 0, level: 100 };
    expect(mapIntensityToGray(100, zero)).toBe(0);
    expect(mapIntensityToGray(101, zero)).toBe(255);
  });
});

describe('buildInt16WLLut', () => {
  it('is indexed by raw Int16 plus 32768', () => {
    const wl = { window: 400, level: 200 };
    const lut = buildInt16WLLut(wl);
    expect(lut).toHaveLength(65536);
    expect(lut[0 + 32768]).toBe(0);
    expect(lut[400 + 32768]).toBe(255);
  });

  it('agrees with mapIntensityToGray over the whole Int16 range', () => {
    // The LUT is a hot-path shortcut for exactly this function; if the two ever
    // disagree, Int16 volumes render differently from Float32 ones.
    //
    // Compared as bytes on purpose. Below the window mapIntensityToGray yields
    // -0 (Math.round(-0.2) is -0, and clamp's `value < min` is false for it)
    // where the LUT yields +0. Both land as 0 in the Uint8ClampedArray the
    // renderer actually writes, so the distinction exists only for Object.is.
    const asByte = (n: number) => n | 0;
    for (const wl of [
      { window: 400, level: 200 },
      { window: 4000, level: 0 },
      { window: 1, level: -500 },
      { window: 65535, level: 0 },
    ]) {
      const lut = buildInt16WLLut(wl);
      for (let raw = -32768; raw <= 32767; raw += 37) {
        expect(asByte(lut[raw + 32768])).toBe(asByte(mapIntensityToGray(raw, wl)));
      }
    }
  });

  it('matches the zero-window threshold behaviour too', () => {
    const wl = { window: 0, level: 100 };
    const lut = buildInt16WLLut(wl);
    for (const raw of [-32768, 0, 99, 100, 101, 32767]) {
      expect(lut[raw + 32768] | 0).toBe(mapIntensityToGray(raw, wl) | 0);
    }
  });
});

describe('grayToRgba', () => {
  it('writes an opaque gray triple at the given offset', () => {
    const out = new Uint8ClampedArray(8);
    grayToRgba(77, out, 4);
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 77, 77, 77, 255]);
  });
});

describe('resolveWindowLevel', () => {
  it('spans the data when no explicit window is supplied', () => {
    expect(resolveWindowLevel(-1000, 1000)).toEqual({ window: 2000, level: 0 });
  });

  it('honours an explicit DICOM window that overlaps the data', () => {
    expect(resolveWindowLevel(-1000, 1000, 40, 400)).toEqual({ window: 400, level: 40 });
  });

  it('ignores an explicit window that misses the data entirely', () => {
    // A mis-tagged series whose window sits far above every voxel would
    // otherwise render an all-black slice.
    expect(resolveWindowLevel(0, 100, 9000, 50)).toEqual({ window: 100, level: 50 });
  });

  it('ignores a non-finite or non-positive explicit window', () => {
    expect(resolveWindowLevel(0, 100, Number.NaN, 50)).toEqual({ window: 100, level: 50 });
    expect(resolveWindowLevel(0, 100, 50, 0)).toEqual({ window: 100, level: 50 });
  });

  it('never returns a zero-width window for a flat volume', () => {
    expect(resolveWindowLevel(7, 7).window).toBe(1);
  });
});
