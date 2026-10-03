import { dicomAdapter } from '@/lib/import/adapters/dicom/adapter';
import { type DicomSliceOptions, dicomBytes, sourceOf } from '@/lib/import/fixtures';
import { deriveVolumeId } from '@/lib/volumeId';
import { describe, expect, it } from 'vitest';

const noop = () => {};

/** One 3 × 2 slice of series `uid` at height `z`, filled with `base + i`. */
function slice(z: number, base: number, extra: Partial<DicomSliceOptions> = {}) {
  return dicomBytes({
    rows: 2,
    columns: 3,
    pixels: [0, 1, 2, 3, 4, 5].map((i) => base + i),
    signed: true,
    pixelSpacing: [0.4, 0.6],
    position: [-10, 5, z],
    seriesUid: '1.2.3',
    seriesDescription: 'Axial head',
    studyId: 'S1',
    studyDate: '20260311',
    studyTime: '110830',
    manufacturer: 'ACME',
    slope: 2,
    intercept: -1024,
    windowCenter: -1000,
    windowWidth: 50,
    ...extra,
  });
}

describe('dicomAdapter.parse', () => {
  it('assembles slices in position order, applying rescale, into Float32', async () => {
    const source = sourceOf(
      { name: 'c.dcm', bytes: slice(4, 200) },
      { name: 'a.dcm', bytes: slice(0, 0) },
      { name: 'b.dcm', bytes: slice(2, 100) },
    );
    const v = await dicomAdapter.parse(source, noop);
    const raw = [0, 100, 200].flatMap((base) => [0, 1, 2, 3, 4, 5].map((i) => base + i));
    expect(v.voxels).toBeInstanceOf(Float32Array);
    expect(Array.from(v.voxels)).toEqual(raw.map((x) => x * 2 - 1024));
    expect(v.scalarMin).toBe(-1024);
    expect(v.scalarMax).toBe(-614);
    // The explicit window overlaps the data, so it wins over the data range.
    expect(v.windowLevel).toEqual({ window: 50, level: -1000 });
    expect(v.meta).toEqual({
      studyId: 'S1',
      acquired: '2026 · 03 · 11 11:08 UTC',
      protocol: 'Axial head',
      scanner: 'ACME',
      modality: 'CT',
      spacing: [0.6, 0.4, 2],
      origin: [-10, 5, 0],
      dims: [3, 2, 3],
      bitsAllocated: 16,
      rescaleSlope: 2,
      rescaleIntercept: -1024,
    });
    expect(deriveVolumeId(v)).toBe('dicom:3x2x3:0.6000x0.4000x2.0000:16:-1024:-614:S1:Axial head');
  });

  it('reads unsigned and 8-bit pixels', async () => {
    const u16 = await dicomAdapter.parse(
      sourceOf({
        name: 'a.dcm',
        bytes: slice(0, 60000, { signed: false, slope: 1, intercept: 0 }),
      }),
      noop,
    );
    expect(u16.voxels[0]).toBe(60000);

    const u8 = await dicomAdapter.parse(
      sourceOf({
        name: 'a.dcm',
        bytes: slice(0, 250, { bitsAllocated: 8, signed: false, slope: 1, intercept: 0 }),
      }),
      noop,
    );
    expect(Array.from(u8.voxels)).toEqual([250, 251, 252, 253, 254, 255]);
  });

  it('falls back to slice thickness for a single slice', async () => {
    const v = await dicomAdapter.parse(
      sourceOf({ name: 'a.dcm', bytes: slice(0, 0, { sliceThickness: 1.25 }) }),
      noop,
    );
    expect(v.meta.spacing[2]).toBe(1.25);
  });

  it('assembles only the largest series unless one is chosen', async () => {
    const source = sourceOf(
      { name: 'a1.dcm', bytes: slice(0, 0) },
      { name: 'a2.dcm', bytes: slice(1, 10) },
      { name: 'b1.dcm', bytes: slice(0, 500, { seriesUid: '9.9', seriesDescription: 'Scout' }) },
    );
    expect((await dicomAdapter.parse(source, noop)).meta.dims).toEqual([3, 2, 2]);
    const chosen = await dicomAdapter.parse(source, noop, '9.9');
    expect(chosen.meta.dims).toEqual([3, 2, 1]);
    expect(chosen.meta.protocol).toBe('Scout');
  });

  it('rejects a selection without readable DICOM', async () => {
    await expect(
      dicomAdapter.parse(sourceOf({ name: 'notes.txt', bytes: new Uint8Array(200) }), noop),
    ).rejects.toThrow('No DICOM files found in selection.');
  });
});

describe('dicomAdapter.matches', () => {
  it('accepts DICOM by extension', async () => {
    expect(await dicomAdapter.matches(sourceOf({ name: 'x.IMA', bytes: new Uint8Array() }))).toBe(
      true,
    );
  });

  it('sniffs extensionless files by preamble or first group', async () => {
    expect(await dicomAdapter.matches(sourceOf({ name: 'IM000001', bytes: slice(0, 0) }))).toBe(
      true,
    );
    expect(
      await dicomAdapter.matches(
        sourceOf({ name: 'IM000002', bytes: slice(0, 0, { syntax: 'implicit' }) }),
      ),
    ).toBe(true);
    expect(
      await dicomAdapter.matches(sourceOf({ name: 'readme', bytes: new Uint8Array(300).fill(65) })),
    ).toBe(false);
  });

  it('parses extensionless implicit files found by sniffing', async () => {
    const v = await dicomAdapter.parse(
      sourceOf(
        { name: 'IM2', bytes: slice(1, 10, { syntax: 'implicit' }) },
        { name: 'IM1', bytes: slice(0, 0, { syntax: 'implicit' }) },
      ),
      noop,
    );
    expect(v.meta.dims).toEqual([3, 2, 2]);
    expect(v.voxels[6]).toBe(10 * 2 - 1024);
  });
});

describe('dicomAdapter.listSeries', () => {
  it('lists each series from headers, largest first', async () => {
    const series = await dicomAdapter.listSeries?.(
      sourceOf(
        { name: 'b1.dcm', bytes: slice(0, 0, { seriesUid: '9.9', seriesDescription: 'Scout' }) },
        { name: 'a1.dcm', bytes: slice(0, 0) },
        { name: 'a2.dcm', bytes: slice(1, 0) },
        {
          name: 'c1.dcm',
          bytes: slice(0, 0, {
            seriesUid: '7.7',
            seriesDescription: '',
            orientation: [0, 1, 0, 0, 0, -1],
          }),
        },
      ),
    );
    expect(series).toEqual([
      {
        key: '1.2.3',
        label: 'Axial head',
        count: 2,
        rows: 2,
        columns: 3,
        modality: 'CT',
        orientation: 'Axial',
      },
      {
        key: '9.9',
        label: 'Scout',
        count: 1,
        rows: 2,
        columns: 3,
        modality: 'CT',
        orientation: 'Axial',
      },
      {
        key: '7.7',
        label: 'Series S1',
        count: 1,
        rows: 2,
        columns: 3,
        modality: 'CT',
        orientation: 'Sagittal',
      },
    ]);
  });
});

describe('dicomAdapter — what it cannot read', () => {
  it('rejects compressed transfer syntaxes instead of decoding noise', async () => {
    await expect(
      dicomAdapter.parse(
        sourceOf({
          name: 'a.dcm',
          bytes: slice(0, 0, { transferSyntax: '1.2.840.10008.1.2.4.90', encapsulated: true }),
        }),
        noop,
      ),
    ).rejects.toThrow(
      'This DICOM series is stored as JPEG 2000 Lossless (1.2.840.10008.1.2.4.90), and PrismaMRI reads uncompressed DICOM only.',
    );
    await expect(
      dicomAdapter.parse(
        sourceOf({ name: 'a.dcm', bytes: slice(0, 0, { transferSyntax: '1.2.840.10008.1.2.2' }) }),
        noop,
      ),
    ).rejects.toThrow('Explicit VR Big Endian');
  });

  it('rejects encapsulated pixel data even under an unknown syntax', async () => {
    await expect(
      dicomAdapter.parse(
        sourceOf({
          name: 'a.dcm',
          bytes: slice(0, 0, { transferSyntax: '1.2.3.4', encapsulated: true }),
        }),
        noop,
      ),
    ).rejects.toThrow('stored as a compressed encoding (1.2.3.4)');
  });

  it('rejects colour images', async () => {
    await expect(
      dicomAdapter.parse(
        sourceOf({ name: 'a.dcm', bytes: slice(0, 0, { samplesPerPixel: 3 }) }),
        noop,
      ),
    ).rejects.toThrow('in colour (3 samples per pixel)');
  });

  it('leaves out slices with another matrix instead of padding with empty slices', async () => {
    const localiser = dicomBytes({
      rows: 4,
      columns: 4,
      pixels: Array.from({ length: 16 }, () => 9),
      signed: true,
      position: [-10, 5, 9],
      seriesUid: '1.2.3',
    });
    const v = await dicomAdapter.parse(
      sourceOf(
        { name: 'a.dcm', bytes: slice(0, 0) },
        { name: 'b.dcm', bytes: slice(2, 100) },
        { name: 'z.dcm', bytes: localiser },
      ),
      noop,
    );
    expect(v.meta.dims).toEqual([3, 2, 2]);
    expect(v.voxels.length).toBe(12);
    expect(v.meta.spacing[2]).toBe(2);
  });
});
