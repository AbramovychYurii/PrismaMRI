import { niftiScalarKind, parseNiftiHeader } from '@/lib/import/adapters/nifti/header';
import { niftiBytes } from '@/lib/import/fixtures';
import { describe, expect, it } from 'vitest';

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

describe('parseNiftiHeader', () => {
  it('reads dims, datatype, pixdim, offset and scaling in either byte order', () => {
    for (const littleEndian of [true, false]) {
      const header = parseNiftiHeader(
        view(
          niftiBytes({
            dims: [4, 5, 6],
            datatype: 512,
            bitpix: 16,
            pixdim: [0.5, -0.75, 3],
            slope: 2,
            intercept: -7,
            littleEndian,
            data: new Uint8Array(0),
          }),
        ),
      );
      expect(header).toEqual({
        littleEndian,
        dims: [4, 5, 6],
        datatype: 512,
        pixdim: [0.5, -0.75, 3],
        voxOffset: 352,
        magic: 'n+1',
        sclSlope: 2,
        sclInter: -7,
      });
    }
  });

  it('treats a zero slope as 1 and reports the offset and magic as stored', () => {
    const header = parseNiftiHeader(
      view(
        niftiBytes({
          dims: [1, 1, 1],
          datatype: 2,
          bitpix: 8,
          slope: 0,
          voxOffset: 0,
          data: new Uint8Array(1),
        }),
      ),
    );
    expect(header.sclSlope).toBe(1);
    expect(header.voxOffset).toBe(0);
    expect(header.magic).toBe('n+1');
  });

  it('rejects other files', () => {
    expect(() => parseNiftiHeader(new DataView(new ArrayBuffer(348)))).toThrow(
      'Not a NIfTI-1 file.',
    );
  });
});

describe('niftiScalarKind', () => {
  it('maps supported datatypes and rejects the rest', () => {
    expect(niftiScalarKind(4)).toBe('i16');
    expect(niftiScalarKind(64)).toBe('f64');
    expect(() => niftiScalarKind(128)).toThrow('Unsupported NIfTI datatype 128.');
  });
});
