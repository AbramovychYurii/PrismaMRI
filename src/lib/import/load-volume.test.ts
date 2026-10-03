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
