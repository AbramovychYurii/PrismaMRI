import { SCALAR_BYTES, type ScalarKind, decodeScalars } from '@/lib/import/decode';
import { pack } from '@/lib/import/fixtures';
import { describe, expect, it } from 'vitest';

const noop = () => {};
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

describe('decodeScalars', () => {
  it('decodes every kind in both byte orders', () => {
    const values = [0, 1, 2, 3, 100, 127];
    for (const kind of Object.keys(SCALAR_BYTES) as ScalarKind[]) {
      for (const littleEndian of [true, false]) {
        const out = new Float32Array(values.length);
        decodeScalars(view(pack(kind, values, littleEndian)), kind, out, { littleEndian }, noop);
        expect(Array.from(out), `${kind} ${littleEndian ? 'LE' : 'BE'}`).toEqual(values);
      }
    }
  });

  it('applies slope and intercept and measures the rescaled range', () => {
    const out = new Float32Array(4);
    const range = decodeScalars(
      view(pack('i16', [-3, 0, 5, 1])),
      'i16',
      out,
      { littleEndian: true, slope: 2, intercept: -10 },
      noop,
    );
    expect(Array.from(out)).toEqual([-16, -10, 0, -8]);
    expect(range).toEqual({ min: -16, max: 0 });
  });

  it('measures the range before Float32 storage rounds it', () => {
    const out = new Float32Array(2);
    const range = decodeScalars(
      view(pack('u32', [16_777_217, 1])),
      'u32',
      out,
      { littleEndian: true },
      noop,
    );
    expect(out[0]).toBe(16_777_216);
    expect(range.max).toBe(16_777_217);
  });

  it('stores into Int16 storage as is', () => {
    const out = new Int16Array(3);
    decodeScalars(view(pack('u8', [0, 200, 255])), 'u8', out, { littleEndian: true }, noop);
    expect(Array.from(out)).toEqual([0, 200, 255]);
  });

  it('reports assembling progress from 0 to the voxel count', () => {
    const ticks: [number | undefined, number | undefined][] = [];
    decodeScalars(view(new Uint8Array(10)), 'u8', new Int16Array(10), { littleEndian: true }, (p) =>
      ticks.push([p.current, p.total]),
    );
    expect(ticks).toEqual([
      [0, 10],
      [10, 10],
    ]);
  });
});
