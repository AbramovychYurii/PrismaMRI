import { mhaAdapter } from '@/lib/import/adapters/mha/adapter';
import { ascii, concat, pack, sourceOf } from '@/lib/import/fixtures';
import { resolveWindowLevel } from '@/lib/volume/math';
import { deriveVolumeId } from '@/lib/volumeId';
import { gzipSync, zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';

const noop = () => {};
const VALUES = [-5, 0, 1, 2, 3, 4, 5, 6, 7, 1, 1, 1];

function header(fields: Record<string, string>): Uint8Array {
  const lines = Object.entries(fields).map(([k, v]) => `${k} = ${v}`);
  return ascii(`${lines.join('\n')}\n`);
}

const BASE = {
  ObjectType: 'Image',
  NDims: '3',
  DimSize: '3 2 2',
  ElementSpacing: '0.5 0.75 2',
};

async function parse(bytes: Uint8Array, name = 'ct.mha') {
  return mhaAdapter.parse(sourceOf({ name, bytes }), noop);
}

describe('mhaAdapter', () => {
  it('matches .mha and .mhd', () => {
    expect(mhaAdapter.matches(sourceOf({ name: 'a.mha', bytes: new Uint8Array() }))).toBe(true);
    expect(mhaAdapter.matches(sourceOf({ name: 'a.mhd', bytes: new Uint8Array() }))).toBe(true);
    expect(mhaAdapter.matches(sourceOf({ name: 'a.raw', bytes: new Uint8Array() }))).toBe(false);
  });

  it('reads a LOCAL MET_SHORT volume into Float32', async () => {
    const v = await parse(
      concat(
        header({ ...BASE, ElementType: 'MET_SHORT', ElementDataFile: 'LOCAL' }),
        pack('i16', VALUES),
      ),
    );
    expect(v.voxels).toBeInstanceOf(Float32Array);
    expect(Array.from(v.voxels)).toEqual(VALUES);
    expect(v.windowLevel).toEqual(resolveWindowLevel(-5, 7));
    expect(v.meta).toEqual({
      modality: 'CT',
      protocol: 'ct.mha',
      spacing: [0.5, 0.75, 2],
      origin: [0, 0, 0],
      dims: [3, 2, 2],
      bitsAllocated: 16,
      rescaleSlope: 1,
      rescaleIntercept: 0,
    });
    expect(deriveVolumeId(v)).toBe('mha:3x2x2:0.5000x0.7500x2.0000:16:-5:7:ct.mha');
  });

  it('defaults to MET_SHORT and honours MSB byte order', async () => {
    const v = await parse(
      concat(
        header({ ...BASE, BinaryDataByteOrderMSB: 'True', ElementDataFile: 'LOCAL' }),
        pack('i16', VALUES, false),
      ),
    );
    expect(Array.from(v.voxels)).toEqual(VALUES);
  });

  it('reads gzip-compressed LOCAL data', async () => {
    const values = VALUES.map((x) => x * 1.5);
    const v = await parse(
      concat(
        header({
          ...BASE,
          ElementType: 'MET_FLOAT',
          CompressedData: 'True',
          ElementDataFile: 'LOCAL',
        }),
        gzipSync(pack('f32', values)),
      ),
    );
    expect(Array.from(v.voxels)).toEqual(values);
  });

  it('reads zlib-compressed data, as ITK writes CompressedData', async () => {
    const values = VALUES.map((x) => x * 2);
    const v = await parse(
      concat(
        header({
          ...BASE,
          ElementType: 'MET_SHORT',
          CompressedData: 'True',
          ElementDataFile: 'LOCAL',
        }),
        zlibSync(pack('i16', values)),
      ),
    );
    expect(Array.from(v.voxels)).toEqual(values);
  });

  it('reads a .mhd header with its separate .raw / .zraw data file', async () => {
    const raw = await mhaAdapter.parse(
      sourceOf(
        {
          name: 'CT.mhd',
          bytes: header({ ...BASE, ElementType: 'MET_SHORT', ElementDataFile: 'CT.raw' }),
        },
        { name: 'CT.raw', bytes: pack('i16', VALUES) },
      ),
      noop,
    );
    expect(Array.from(raw.voxels)).toEqual(VALUES);
    expect(raw.meta.protocol).toBe('ct.mhd');

    const zraw = await mhaAdapter.parse(
      sourceOf(
        {
          name: 'ct.mhd',
          bytes: header({
            ...BASE,
            ElementType: 'MET_SHORT',
            CompressedData: 'True',
            ElementDataFile: 'sub/ct.zraw',
          }),
        },
        { name: 'ct.zraw', bytes: zlibSync(pack('i16', VALUES)) },
      ),
      noop,
    );
    expect(Array.from(zraw.voxels)).toEqual(VALUES);
  });

  it('names the missing data file of a .mhd header', async () => {
    await expect(
      mhaAdapter.parse(
        sourceOf({ name: 'ct.mhd', bytes: header({ ...BASE, ElementDataFile: 'ct.raw' }) }),
        noop,
      ),
    ).rejects.toThrow('ct.mhd keeps its voxels in "ct.raw" — select both files (or their folder).');
  });

  it('reports unsupported files', async () => {
    await expect(
      parse(
        concat(header({ ...BASE, DimSize: '6 2', ElementDataFile: 'LOCAL' }), new Uint8Array(24)),
      ),
    ).rejects.toThrow('MHA must be 3-dimensional.');
    await expect(
      parse(
        concat(
          header({ ...BASE, ElementType: 'MET_LONG_LONG', ElementDataFile: 'LOCAL' }),
          new Uint8Array(96),
        ),
      ),
    ).rejects.toThrow('Unsupported MHA ElementType "MET_LONG_LONG".');
  });
});
