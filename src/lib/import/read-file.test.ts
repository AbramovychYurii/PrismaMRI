import { detectCompression, inflate, inflateBytes, readBlobBytes } from '@/lib/import/read-file';
import { deflateSync, gzipSync, zlibSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Incompressible, so the gzip input spans several 1 MB feed chunks. */
function noise(length: number): Uint8Array {
  const out = new Uint8Array(length);
  let x = 0x9e3779b9;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}

/** Byte comparison — deep equality on megabyte arrays is far too slow. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const DATA = noise(2_500_000);
const GZ = gzipSync(DATA);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readBlobBytes', () => {
  it('returns the blob bytes and reports progress up to its size', async () => {
    const ticks: number[] = [];
    const out = await readBlobBytes(
      new Blob([DATA as Uint8Array<ArrayBuffer>]),
      (loaded, total) => {
        expect(total).toBe(DATA.length);
        ticks.push(loaded);
      },
    );
    expect(sameBytes(out, DATA)).toBe(true);
    expect(ticks.at(-1)).toBe(DATA.length);
  });
});

describe('inflate', () => {
  for (const decoder of ['native', 'fflate'] as const) {
    describe(decoder, () => {
      const run = (input: Uint8Array, expected?: number) => {
        if (decoder === 'fflate') vi.stubGlobal('DecompressionStream', undefined);
        const ticks: number[] = [];
        return inflate(input, (loaded) => ticks.push(loaded), expected).then((out) => ({
          out,
          ticks,
        }));
      };

      it('inflates and reports compressed input consumed', async () => {
        expect(GZ.length).toBeGreaterThan(2 * 1024 * 1024);
        const { out, ticks } = await run(GZ);
        expect(sameBytes(out, DATA)).toBe(true);
        expect(ticks.at(-1)).toBe(GZ.length);
      });

      it('fills a buffer of the expected size exactly', async () => {
        const { out } = await run(GZ, DATA.length);
        expect(sameBytes(out, DATA)).toBe(true);
        expect(out.byteLength).toBe(DATA.length);
        expect(out.buffer.byteLength).toBe(DATA.length);
      });

      it('keeps everything when the stream overruns the expected size', async () => {
        expect(sameBytes((await run(GZ, 1000)).out, DATA)).toBe(true);
      });

      it('returns a shorter view when the stream ends early', async () => {
        const { out } = await run(GZ, DATA.length + 10);
        expect(sameBytes(out, DATA)).toBe(true);
      });
    });
  }

  it('falls back to fflate when the native decoder rejects the input', async () => {
    // Two gzip members back to back: fflate reads both.
    const twoMembers = new Uint8Array([
      ...gzipSync(DATA.subarray(0, 10)),
      ...gzipSync(DATA.subarray(10, 20)),
    ]);
    const out = await inflate(twoMembers);
    expect(Array.from(out.subarray(0, 10))).toEqual(Array.from(DATA.subarray(0, 10)));
  });

  it('rejects data that is not gzip', async () => {
    await expect(inflate(new Uint8Array([1, 2, 3, 4, 5]))).rejects.toThrow();
  });
});

describe('inflateBytes', () => {
  it('matches the native decoder byte for byte', async () => {
    expect(sameBytes(inflateBytes(GZ, 'gzip'), await inflate(GZ))).toBe(true);
  });
});

describe('zlib and raw deflate', () => {
  const sample = DATA.subarray(0, 200_000);
  for (const decoder of ['native', 'fflate'] as const) {
    it(`inflates each wrapper (${decoder})`, async () => {
      if (decoder === 'fflate') vi.stubGlobal('DecompressionStream', undefined);
      for (const packed of [gzipSync(sample), zlibSync(sample), deflateSync(sample)]) {
        expect(sameBytes(await inflate(packed), sample)).toBe(true);
      }
    });
  }

  it('tells the wrappers apart by their headers', () => {
    expect(detectCompression(gzipSync(sample))).toBe('gzip');
    expect(detectCompression(zlibSync(sample))).toBe('deflate');
    expect(detectCompression(deflateSync(sample))).toBe('deflate-raw');
  });
});
