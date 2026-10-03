import {
  computeDicomSliceLocation,
  parseImplicitLittleEndianDicom,
  resolveDicomHeaderReadLength,
  sortDicomSlices,
} from '@/lib/import/adapters/dicom/reader';
import { dicomBytes } from '@/lib/import/fixtures';
import { describe, expect, it } from 'vitest';

const buffer = (bytes: Uint8Array) => bytes.slice().buffer as ArrayBuffer;

describe('parseImplicitLittleEndianDicom', () => {
  it('reads the header of an Explicit VR file with preamble and meta group', () => {
    const tags = parseImplicitLittleEndianDicom(
      buffer(
        dicomBytes({
          rows: 2,
          columns: 3,
          pixels: [1, 2, 3, 4, 5, 6],
          signed: true,
          pixelSpacing: [0.4, 0.6],
          position: [-10, 5.5, 42],
          orientation: [1, 0, 0, 0, 1, 0],
          instanceNumber: 7,
          seriesUid: '1.2.3.4',
          seriesDescription: 'Head CT',
          studyId: 'S1',
          studyDate: '20260311',
          studyTime: '110830',
          modality: 'CT',
          manufacturer: 'ACME',
          slope: 1,
          intercept: -1024,
          windowCenter: 40,
          windowWidth: 400,
          sliceThickness: 1.25,
        }),
      ),
    );
    expect(tags).toMatchObject({
      rows: 2,
      columns: 3,
      bitsAllocated: 16,
      pixelRepresentation: 1,
      samplesPerPixel: 1,
      rescaleSlope: 1,
      rescaleIntercept: -1024,
      windowCenter: 40,
      windowWidth: 400,
      pixelSpacing: [0.4, 0.6],
      sliceThickness: 1.25,
      imagePositionPatient: [-10, 5.5, 42],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      instanceNumber: 7,
      seriesInstanceUid: '1.2.3.4',
      studyId: 'S1',
      studyDate: '20260311',
      studyTime: '110830',
      modality: 'CT',
      manufacturer: 'ACME',
      seriesDescription: 'Head CT',
      numberOfFrames: 1,
      pixelDataLength: 12,
    });
    expect(tags?.pixelDataOffset).toBeGreaterThan(132);
  });

  it('reads an Implicit VR data set without preamble', () => {
    const bytes = dicomBytes({
      syntax: 'implicit',
      rows: 2,
      columns: 2,
      pixels: [10, 20, 30, 40],
      position: [0, 0, 3],
    });
    const tags = parseImplicitLittleEndianDicom(buffer(bytes));
    expect(tags).toMatchObject({ rows: 2, columns: 2, imagePositionPatient: [0, 0, 3] });
    const view = new DataView(buffer(bytes), tags?.pixelDataOffset);
    expect([0, 1, 2, 3].map((i) => view.getUint16(i * 2, true))).toEqual([10, 20, 30, 40]);
  });

  it('parses a header-only prefix of the file', () => {
    const bytes = dicomBytes({ rows: 2, columns: 2, pixels: [1, 2, 3, 4] });
    const tags = parseImplicitLittleEndianDicom(buffer(bytes.subarray(0, bytes.length - 6)));
    expect(tags).toMatchObject({ rows: 2, columns: 2 });
  });

  it('returns null without rows/columns or for tiny buffers', () => {
    expect(parseImplicitLittleEndianDicom(new ArrayBuffer(4))).toBeNull();
    expect(parseImplicitLittleEndianDicom(new ArrayBuffer(256))).toBeNull();
  });

  it('defaults missing optional tags', () => {
    const tags = parseImplicitLittleEndianDicom(
      buffer(dicomBytes({ rows: 1, columns: 2, pixels: [1, 2] })),
    );
    expect(tags).toMatchObject({
      rescaleSlope: 1,
      rescaleIntercept: 0,
      pixelSpacing: [1, 1],
      numberOfFrames: 1,
      pixelRepresentation: 0,
    });
  });
});

describe('slice ordering', () => {
  const tags = (extra: object) => ({
    ...(parseImplicitLittleEndianDicom(
      buffer(dicomBytes({ rows: 1, columns: 1, pixels: [0] })),
    ) as NonNullable<ReturnType<typeof parseImplicitLittleEndianDicom>>),
    ...extra,
  });

  it('projects the position onto the slice normal', () => {
    expect(
      computeDicomSliceLocation(
        tags({ imagePositionPatient: [1, 2, 3], imageOrientationPatient: [1, 0, 0, 0, 0, -1] }),
      ),
    ).toBe(2);
  });

  it('falls back to slice location, then instance number', () => {
    expect(
      computeDicomSliceLocation(
        tags({ imagePositionPatient: undefined, sliceLocation: 12.5, instanceNumber: 3 }),
      ),
    ).toBe(12.5);
    expect(
      computeDicomSliceLocation(tags({ imagePositionPatient: undefined, instanceNumber: 3 })),
    ).toBe(3);
  });

  it('sorts ascending along the normal', () => {
    const slices = [5, -1, 2].map((z) => ({ z, tags: tags({ imagePositionPatient: [0, 0, z] }) }));
    expect(sortDicomSlices(slices).map((s) => s.z)).toEqual([-1, 2, 5]);
  });
});

describe('resolveDicomHeaderReadLength', () => {
  it('caps header reads at 64 KB', () => {
    expect(resolveDicomHeaderReadLength(1000)).toBe(1000);
    expect(resolveDicomHeaderReadLength(10_000_000)).toBe(65536);
  });
});
