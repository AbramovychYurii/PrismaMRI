import { ascii, concat, dicomBytes, niftiBytes, pack, sourceOf } from '@/lib/import/fixtures';
import { loadVolumeFromSource } from '@/lib/import/load-volume';
import { progressPercent } from '@/workers/volume/progress';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

const noop = () => {};

const NRRD = concat(
  ascii('NRRD0004\ntype: short\nsizes: 2 2 2\nencoding: raw\n\n'),
  pack('i16', [1, 2, 3, 4, 5, 6, 7, 8]),
);

const dcm = (uid: string, z: number) =>
  dicomBytes({ rows: 1, columns: 2, pixels: [z, z], position: [0, 0, z], seriesUid: uid });

describe('loadVolumeFromSource', () => {
  it('expands ZIP archives and skips __MACOSX entries', async () => {
    const zip = zipSync({
      'study/vol.nrrd': NRRD,
      '__MACOSX/study/._vol.nrrd': new Uint8Array(10),
    });
    const out = await loadVolumeFromSource(sourceOf({ name: 'study.zip', bytes: zip }), noop);
    expect(out.kind).toBe('volume');
    if (out.kind !== 'volume') return;
    expect(out.volume.formatId).toBe('nrrd');
    expect(out.volume.meta.protocol).toBe('vol.nrrd');
    expect(Array.from(out.volume.voxels)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('hands back the expanded source with a series choice', async () => {
    const zip = zipSync({
      'a1.dcm': dcm('1.1', 0),
      'b1.dcm': dcm('2.2', 0),
    });
    const choice = await loadVolumeFromSource(sourceOf({ name: 'study.zip', bytes: zip }), noop);
    expect(choice.kind).toBe('series-choice');
    if (choice.kind !== 'series-choice') return;
    expect(choice.source.files.map((f) => f.name).sort()).toEqual(['a1.dcm', 'b1.dcm']);

    const picked = await loadVolumeFromSource(choice.source, noop, '2.2');
    expect(picked.kind === 'volume' && picked.volume.meta.dims).toEqual([2, 1, 1]);
  });

  it('tries single-file formats before DICOM', async () => {
    const nifti = niftiBytes({ dims: [2, 2, 2], datatype: 2, bitpix: 8, data: new Uint8Array(8) });
    const out = await loadVolumeFromSource(
      sourceOf({ name: 'a.dcm', bytes: dcm('1', 0) }, { name: 'b.nii', bytes: nifti }),
      noop,
    );
    expect(out.kind === 'volume' && out.volume.formatId).toBe('nifti');
  });

  it('hands back the series list when a DICOM source holds several', async () => {
    const source = sourceOf(
      { name: 'a1.dcm', bytes: dcm('1.1', 0) },
      { name: 'a2.dcm', bytes: dcm('1.1', 1) },
      { name: 'b1.dcm', bytes: dcm('2.2', 0) },
    );
    const choice = await loadVolumeFromSource(source, noop);
    expect(choice.kind).toBe('series-choice');
    if (choice.kind !== 'series-choice') return;
    expect(choice.series.map((s) => [s.key, s.count])).toEqual([
      ['1.1', 2],
      ['2.2', 1],
    ]);

    const picked = await loadVolumeFromSource(source, noop, '2.2');
    expect(picked.kind === 'volume' && picked.volume.meta.dims).toEqual([2, 1, 1]);
  });

  it('loads a single DICOM series straight through', async () => {
    const out = await loadVolumeFromSource(
      sourceOf({ name: 'a1.dcm', bytes: dcm('1.1', 0) }, { name: 'a2.dcm', bytes: dcm('1.1', 1) }),
      noop,
    );
    expect(out.kind === 'volume' && out.volume.meta.dims).toEqual([2, 1, 2]);
  });

  it('rejects an unrecognised selection', async () => {
    await expect(
      loadVolumeFromSource(sourceOf({ name: 'notes.txt', bytes: new Uint8Array(300) }), noop),
    ).rejects.toThrow('Unrecognized format.');
  });

  it('reports stages in order and finishes with done', async () => {
    const stages: string[] = [];
    await loadVolumeFromSource(sourceOf({ name: 'v.nrrd', bytes: NRRD }), (p) => {
      if (p.stage && stages.at(-1) !== p.stage) stages.push(p.stage);
    });
    expect(stages).toEqual(['scanning', 'parsing-headers', 'reading-files', 'assembling', 'done']);
  });
});

describe('loadVolumeFromSource orientation', () => {
  const load = async (...files: { name: string; bytes: Uint8Array }[]) => {
    const out = await loadVolumeFromSource(sourceOf(...files), noop);
    if (out.kind !== 'volume') throw new Error('expected a volume');
    return out.volume;
  };
  const RAMP = Uint8Array.from({ length: 8 }, (_, i) => i);
  const nifti = (o: Partial<Parameters<typeof niftiBytes>[0]>) =>
    niftiBytes({ dims: [2, 2, 2], datatype: 2, bitpix: 8, data: RAMP, ...o });

  it('turns a sagittal DICOM series so its slices run left to right', async () => {
    // Columns posterior, rows inferior; the slice at x = 5 is the patient's left.
    const sag = (x: number) =>
      dicomBytes({
        rows: 2,
        columns: 3,
        pixels: [0, 1, 2, 10, 11, 12].map((v) => v + (x === 5 ? 100 : 0)),
        orientation: [0, 1, 0, 0, 0, -1],
        position: [x, 0, 0],
        pixelSpacing: [2, 0.5],
      });
    const v = await load({ name: 'r.dcm', bytes: sag(0) }, { name: 'l.dcm', bytes: sag(5) });

    expect(v.meta.dims).toEqual([2, 3, 2]);
    expect(v.meta.spacing).toEqual([5, 0.5, 2]);
    expect(v.meta.origin).toEqual([0, 0, -2]);
    // x: right slice then left; y: column; z: the inferior row (10…) first.
    expect(Array.from(v.voxels)).toEqual([10, 110, 11, 111, 12, 112, 0, 100, 1, 101, 2, 102]);
  });

  it('flips a NIfTI stored in RAS order by its sform', async () => {
    const v = await load({
      name: 'ras.nii',
      bytes: nifti({
        sform: [
          [1, 0, 0, 0],
          [0, 1, 0, 0],
          [0, 0, 1, 0],
        ],
      }),
    });
    expect(Array.from(v.voxels)).toEqual([3, 2, 1, 0, 7, 6, 5, 4]);
  });

  it('reads the qform when no sform is set, qfac included', async () => {
    // 180° about z: RAS axes that run right-to-left and front-to-back are LPS.
    const lps = await load({ name: 'q.nii', bytes: nifti({ qform: { quatern: [0, 0, 1] } }) });
    expect(Array.from(lps.voxels)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    const flippedZ = await load({
      name: 'q.nii',
      bytes: nifti({ qform: { quatern: [0, 0, 1], qfac: -1 } }),
    });
    expect(Array.from(flippedZ.voxels)).toEqual([4, 5, 6, 7, 0, 1, 2, 3]);
  });

  it('leaves a NIfTI with neither transform as stored', async () => {
    const v = await load({ name: 'plain.nii', bytes: nifti({}) });
    expect(Array.from(v.voxels)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('follows the NRRD space, and ignores directions in a non-anatomical one', async () => {
    const withSpace = (space: string) =>
      concat(
        ascii(
          [
            'NRRD0004',
            'type: short',
            'sizes: 2 2 2',
            `space: ${space}`,
            'space directions: (1,0,0) (0,1,0) (0,0,1)',
            'encoding: raw',
            '\n',
          ].join('\n'),
        ),
        pack('i16', [1, 2, 3, 4, 5, 6, 7, 8]),
      );
    const ras = await load({ name: 'a.nrrd', bytes: withSpace('right-anterior-superior') });
    expect(Array.from(ras.voxels)).toEqual([4, 3, 2, 1, 8, 7, 6, 5]);

    const lps = await load({ name: 'b.nrrd', bytes: withSpace('left-posterior-superior') });
    expect(Array.from(lps.voxels)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    const scanner = await load({ name: 'c.nrrd', bytes: withSpace('scanner-xyz') });
    expect(Array.from(scanner.voxels)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('reads the MetaImage direction matrix one axis per triple', async () => {
    const mha = concat(
      ascii(
        'ObjectType = Image\nNDims = 3\nDimSize = 2 1 1\n' +
          'TransformMatrix = -1 0 0 0 1 0 0 0 1\nElementType = MET_SHORT\nElementDataFile = LOCAL\n',
      ),
      pack('i16', [1, 2]),
    );
    const v = await load({ name: 'a.mha', bytes: mha });
    expect(Array.from(v.voxels)).toEqual([2, 1]);
  });
});

describe('progressPercent', () => {
  const at = (
    stage: Parameters<typeof progressPercent>[0]['stage'],
    current: number,
    total: number,
  ) => progressPercent({ stage, current, total, message: '' });

  it('maps each stage onto its share of the bar', () => {
    expect(at('scanning', 0, 0)).toBe(0);
    expect(at('reading-files', 0, 10)).toBe(15);
    expect(at('reading-files', 5, 10)).toBe(43);
    expect(at('assembling', 10, 10)).toBe(88);
    expect(at('preparing-3d', 100, 100)).toBe(99);
    expect(at('done', 0, 0)).toBe(100);
  });

  it('clamps overshoot within a stage', () => {
    expect(at('assembling', 20, 10)).toBe(88);
  });
});
