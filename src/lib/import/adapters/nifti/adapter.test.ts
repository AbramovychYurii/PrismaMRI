import { niftiAdapter } from '@/lib/import/adapters/nifti/adapter';
import { concat, niftiBytes, pack, sourceOf } from '@/lib/import/fixtures';
import { resolveWindowLevel } from '@/lib/volume/math';
import { deriveVolumeId } from '@/lib/volumeId';
import { gzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

const noop = () => {};
const VALUES = [-5, 0, 1, 2, 3, 4, 5, 6, 7, 1, 1, 1];

async function parse(bytes: Uint8Array, name = 'brain.nii') {
  return niftiAdapter.parse(sourceOf({ name, bytes }), noop);
}

describe('niftiAdapter', () => {
  it('matches .nii, .nii.gz and .hdr', () => {
    for (const name of ['a.nii', 'a.nii.gz', 'a.hdr']) {
      expect(niftiAdapter.matches(sourceOf({ name, bytes: new Uint8Array() }))).toBe(true);
    }
    expect(niftiAdapter.matches(sourceOf({ name: 'a.nrrd', bytes: new Uint8Array() }))).toBe(false);
  });

  it('reads int16 with slope/intercept into Float32', async () => {
    const v = await parse(
      niftiBytes({
        dims: [3, 2, 2],
        datatype: 4,
        bitpix: 16,
        pixdim: [0.8, -0.8, 2.5],
        slope: 2,
        intercept: -10,
        data: pack('i16', VALUES),
      }),
    );
    const expected = VALUES.map((x) => x * 2 - 10);
    expect(v.voxels).toBeInstanceOf(Float32Array);
    expect(Array.from(v.voxels)).toEqual(expected);
    expect(v.scalarMin).toBe(-20);
    expect(v.scalarMax).toBe(4);
    expect(v.windowLevel).toEqual(resolveWindowLevel(-20, 4));
    expect(v.meta).toEqual({
      modality: 'MR',
      protocol: 'brain.nii',
      spacing: [expect.closeTo(0.8, 6), expect.closeTo(0.8, 6), 2.5],
      origin: [0, 0, 0],
      dims: [3, 2, 2],
      bitsAllocated: 32,
      rescaleSlope: 2,
      rescaleIntercept: -10,
    });
    expect(deriveVolumeId(v)).toBe('nifti:3x2x2:0.8000x0.8000x2.5000:32:-20:4:brain.nii');
  });

  it('gunzips .nii.gz and treats a zero slope as 1', async () => {
    const v = await parse(
      gzipSync(
        niftiBytes({
          dims: [3, 2, 2],
          datatype: 2,
          bitpix: 8,
          slope: 0,
          data: pack('u8', VALUES.map(Math.abs)),
        }),
      ),
      'brain.nii.gz',
    );
    expect(Array.from(v.voxels)).toEqual(VALUES.map(Math.abs));
    expect(v.meta.rescaleSlope).toBe(1);
    expect(v.meta.spacing).toEqual([1, 1, 1]);
  });

  it('reads a big-endian float32 header and data', async () => {
    const values = VALUES.map((x) => x / 4);
    const v = await parse(
      niftiBytes({
        dims: [3, 2, 2],
        datatype: 16,
        bitpix: 32,
        littleEndian: false,
        data: pack('f32', values, false),
      }),
    );
    expect(Array.from(v.voxels)).toEqual(values);
  });

  it('decodes every supported datatype', async () => {
    const cases: [number, number, 'i8' | 'u8' | 'i16' | 'u16' | 'i32' | 'f32' | 'f64'][] = [
      [2, 8, 'u8'],
      [256, 8, 'i8'],
      [4, 16, 'i16'],
      [512, 16, 'u16'],
      [8, 32, 'i32'],
      [16, 32, 'f32'],
      [64, 64, 'f64'],
    ];
    const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    for (const [datatype, bitpix, kind] of cases) {
      const v = await parse(
        niftiBytes({ dims: [3, 2, 2], datatype, bitpix, data: pack(kind, values) }),
      );
      expect(Array.from(v.voxels), `datatype ${datatype}`).toEqual(values);
    }
  });

  it('rejects files that are not NIfTI-1 and unsupported datatypes', async () => {
    await expect(parse(new Uint8Array(400))).rejects.toThrow('Not a NIfTI-1 file.');
    await expect(
      parse(niftiBytes({ dims: [3, 2, 2], datatype: 128, bitpix: 24, data: new Uint8Array(36) })),
    ).rejects.toThrow('Unsupported NIfTI datatype 128.');
  });
});

describe('niftiAdapter — .hdr/.img pairs', () => {
  const pair = (magic: 'ni1' | 'n+1', voxOffset = 0) =>
    niftiBytes({
      dims: [3, 2, 2],
      datatype: 4,
      bitpix: 16,
      pixdim: [1, 1, 2],
      voxOffset,
      magic,
      data: new Uint8Array(0),
    }).subarray(0, 348);

  it('reads the voxels from the .img of the same name', async () => {
    const v = await niftiAdapter.parse(
      sourceOf(
        { name: 'Brain.hdr', bytes: pair('ni1') },
        { name: 'Brain.img', bytes: pack('i16', VALUES) },
      ),
      noop,
    );
    expect(Array.from(v.voxels)).toEqual(VALUES);
    expect(v.meta.spacing).toEqual([1, 1, 2]);
    expect(v.meta.protocol).toBe('brain.hdr');
  });

  it('honours vox_offset into the .img and reads a gzipped .img', async () => {
    const offset = await niftiAdapter.parse(
      sourceOf(
        { name: 'b.hdr', bytes: pair('ni1', 8) },
        { name: 'b.img', bytes: concat(new Uint8Array(8), pack('i16', VALUES)) },
      ),
      noop,
    );
    expect(Array.from(offset.voxels)).toEqual(VALUES);

    const gz = await niftiAdapter.parse(
      sourceOf(
        { name: 'b.hdr', bytes: pair('ni1') },
        { name: 'b.img.gz', bytes: gzipSync(pack('i16', VALUES)) },
      ),
      noop,
    );
    expect(Array.from(gz.voxels)).toEqual(VALUES);
  });

  it('prefers a single-file .nii and names a missing .img', async () => {
    await expect(
      niftiAdapter.parse(sourceOf({ name: 'b.hdr', bytes: pair('ni1') }), noop),
    ).rejects.toThrow('b.hdr keeps its voxels in "b.img" — select both files (or their folder).');
  });
});
