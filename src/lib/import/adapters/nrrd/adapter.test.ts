import { nrrdAdapter } from '@/lib/import/adapters/nrrd/adapter';
import { ascii, concat, pack, sourceOf } from '@/lib/import/fixtures';
import { resolveWindowLevel } from '@/lib/volume/math';
import { deriveVolumeId } from '@/lib/volumeId';
import { gzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

const noop = () => {};

function nrrd(header: string[], payload: Uint8Array, eol = '\n'): Uint8Array {
  return concat(ascii(['NRRD0004', ...header].join(eol) + eol + eol), payload);
}

/** 3 × 2 × 2 ramp with a negative value, so the range is not trivially 0-based. */
const VALUES = [-5, 0, 1, 2, 3, 4, 5, 6, 7, 1, 1, 1];

async function parse(bytes: Uint8Array, name = 'vol.nrrd') {
  return nrrdAdapter.parse(sourceOf({ name, bytes }), noop);
}

describe('nrrdAdapter', () => {
  it('matches .nrrd and .nhdr names only', () => {
    expect(nrrdAdapter.matches(sourceOf({ name: 'a.NRRD', bytes: new Uint8Array() }))).toBe(true);
    expect(nrrdAdapter.matches(sourceOf({ name: 'a.nhdr', bytes: new Uint8Array() }))).toBe(true);
    expect(nrrdAdapter.matches(sourceOf({ name: 'a.nii', bytes: new Uint8Array() }))).toBe(false);
  });

  it('reads a raw little-endian short volume into Int16 with spacings', async () => {
    const v = await parse(
      nrrd(
        ['type: short', 'dimension: 3', 'sizes: 3 2 2', 'spacings: 0.5 0.5 2', 'encoding: raw'],
        pack('i16', VALUES),
      ),
    );
    expect(v.voxels).toBeInstanceOf(Int16Array);
    expect(Array.from(v.voxels)).toEqual(VALUES);
    expect(v.scalarMin).toBe(-5);
    expect(v.scalarMax).toBe(7);
    expect(v.windowLevel).toEqual(resolveWindowLevel(-5, 7));
    expect(v.formatId).toBe('nrrd');
    expect(v.meta).toEqual({
      modality: 'CT',
      protocol: 'vol.nrrd',
      spacing: [0.5, 0.5, 2],
      origin: [0, 0, 0],
      dims: [3, 2, 2],
      bitsAllocated: 16,
      rescaleSlope: 1,
      rescaleIntercept: 0,
    });
    // The volume id keys stored annotations and the demo report — pin it.
    expect(deriveVolumeId(v)).toBe('nrrd:3x2x2:0.5000x0.5000x2.0000:16:-5:7:vol.nrrd');
  });

  it('keeps 8-bit sources in Int16 and widens unsigned 16-bit to Float32', async () => {
    const u8 = await parse(
      nrrd(
        ['type: uchar', 'sizes: 3 2 2', 'encoding: raw'],
        pack('u8', [0, 255, ...VALUES.slice(2)]),
      ),
    );
    expect(u8.voxels).toBeInstanceOf(Int16Array);
    expect(u8.voxels[1]).toBe(255);
    expect(u8.meta.bitsAllocated).toBe(8);

    const u16 = await parse(
      nrrd(
        ['type: unsigned short', 'sizes: 3 2 2', 'encoding: raw'],
        pack('u16', [65535, ...VALUES.slice(1).map(Math.abs)]),
      ),
    );
    expect(u16.voxels).toBeInstanceOf(Float32Array);
    expect(u16.voxels[0]).toBe(65535);
  });

  it('decodes gzip, big-endian floats and space directions', async () => {
    const values = VALUES.map((x) => x + 0.5);
    const v = await parse(
      nrrd(
        [
          'type: float',
          'sizes: 3 2 2',
          'endian: big',
          'encoding: gzip',
          'space directions: (0.3,0,0) (0,0.4,0) (0,0,1.2)',
        ],
        gzipSync(pack('f32', values, false)),
      ),
    );
    expect(v.voxels).toBeInstanceOf(Float32Array);
    expect(Array.from(v.voxels)).toEqual(values);
    expect(v.meta.spacing.map((s) => Number(s.toFixed(6)))).toEqual([0.3, 0.4, 1.2]);
    expect(v.meta.bitsAllocated).toBe(32);
  });

  it('accepts a CRLF header', async () => {
    const v = await parse(nrrd(['type: short', 'sizes: 3 2 2'], pack('i16', VALUES), '\r\n'));
    expect(Array.from(v.voxels)).toEqual(VALUES);
  });

  it('reports malformed and unsupported files', async () => {
    await expect(parse(ascii('NRRD0004\ntype: short\nsizes: 3 2 2\n'))).rejects.toThrow(
      'Malformed NRRD header.',
    );
    await expect(parse(nrrd(['type: block', 'sizes: 3 2 2'], new Uint8Array(12)))).rejects.toThrow(
      'Unsupported NRRD type "block".',
    );
    await expect(parse(nrrd(['type: short', 'sizes: 6 2'], new Uint8Array(24)))).rejects.toThrow(
      'NRRD must be 3-dimensional.',
    );
    await expect(
      parse(nrrd(['type: short', 'sizes: 3 2 2', 'encoding: hex'], new Uint8Array(24))),
    ).rejects.toThrow('Unsupported NRRD encoding "hex".');
  });
});

describe('nrrdAdapter — detached headers', () => {
  const nhdr = (fields: string[], blankLine = false) =>
    ascii(
      `${['NRRD0004', 'type: short', 'sizes: 3 2 2', ...fields].join('\n')}\n${blankLine ? '\n' : ''}`,
    );

  it('reads the data file a .nhdr names, with or without a closing blank line', async () => {
    for (const blankLine of [false, true]) {
      const v = await nrrdAdapter.parse(
        sourceOf(
          { name: 'Head.nhdr', bytes: nhdr(['encoding: raw', 'data file: Head.raw'], blankLine) },
          { name: 'Head.raw', bytes: pack('i16', VALUES) },
        ),
        noop,
      );
      expect(Array.from(v.voxels)).toEqual(VALUES);
      expect(v.meta.protocol).toBe('head.nhdr');
    }
  });

  it('inflates a gzipped data file and honours byte skip', async () => {
    const gz = await nrrdAdapter.parse(
      sourceOf(
        { name: 'h.nhdr', bytes: nhdr(['encoding: gzip', 'data file: ./data/h.raw.gz']) },
        { name: 'h.raw.gz', bytes: gzipSync(pack('i16', VALUES)) },
      ),
      noop,
    );
    expect(Array.from(gz.voxels)).toEqual(VALUES);

    const skipped = await nrrdAdapter.parse(
      sourceOf(
        { name: 'h.nhdr', bytes: nhdr(['encoding: raw', 'byte skip: 4', 'data file: h.raw']) },
        { name: 'h.raw', bytes: concat(new Uint8Array(4), pack('i16', VALUES)) },
      ),
      noop,
    );
    expect(Array.from(skipped.voxels)).toEqual(VALUES);

    const atEnd = await nrrdAdapter.parse(
      sourceOf(
        { name: 'h.nhdr', bytes: nhdr(['encoding: raw', 'byte skip: -1', 'data file: h.raw']) },
        { name: 'h.raw', bytes: concat(new Uint8Array(10), pack('i16', VALUES)) },
      ),
      noop,
    );
    expect(Array.from(atEnd.voxels)).toEqual(VALUES);
  });

  it('names a missing data file and rejects multi-file data', async () => {
    await expect(
      nrrdAdapter.parse(sourceOf({ name: 'h.nhdr', bytes: nhdr(['data file: h.raw']) }), noop),
    ).rejects.toThrow('h.nhdr keeps its voxels in "h.raw" — select both files (or their folder).');
    await expect(
      nrrdAdapter.parse(
        sourceOf({ name: 'h.nhdr', bytes: nhdr(['data file: slice%03d.raw 0 9 1']) }),
        noop,
      ),
    ).rejects.toThrow('is not supported');
  });
});
