import {
  QUOTA_SHARE,
  type StoredSeriesFiles,
  type StoredSeriesMeta,
  filesBytes,
  fitsInQuota,
  recordBuffer,
  recordBytes,
  seriesFromRecords,
} from '@/lib/volumeDb';
import type { LoadedVolume, PreparedVolumeFor3D, VolumeHistogram } from '@prisma-mri/viewer-core';
import { describe, expect, it } from 'vitest';

const MB = 1e6;
const GB = 1e9;

function parts(voxelBytes: number, textureBytes: number, histBins: number) {
  const volume = { voxels: new Int16Array(voxelBytes / 2) } as LoadedVolume;
  const prepared3D = { data: new Uint8Array(textureBytes) } as PreparedVolumeFor3D;
  const histogram = { bins: new Uint32Array(histBins) } as VolumeHistogram;
  return { volume, prepared3D, histogram };
}

describe('recordBytes', () => {
  it('adds up the three buffers that actually cost anything', () => {
    const { volume, prepared3D, histogram } = parts(1000, 500, 25);
    expect(recordBytes(volume, prepared3D, histogram)).toBe(1000 + 500 + 100);
  });

  it('measures bytes, not element counts', () => {
    // An Int16 volume of N voxels costs 2N bytes — reading .length instead of
    // .byteLength would halve every estimate for exactly the largest studies.
    const voxels = new Int16Array(1000);
    const bytes = recordBytes(
      { voxels } as LoadedVolume,
      { data: new Uint8Array(0) } as PreparedVolumeFor3D,
      { bins: new Uint32Array(0) } as VolumeHistogram,
    );
    expect(bytes).toBe(2000);
    expect(bytes).not.toBe(voxels.length);
  });

  it('scales to a real full-body study', () => {
    // 512×512×996 Int16 voxels + a 512³ Uint8 texture.
    const { volume, prepared3D, histogram } = parts(512 * 512 * 996 * 2, 512 ** 3, 1024);
    expect(recordBytes(volume, prepared3D, histogram) / GB).toBeCloseTo(0.66, 1);
  });
});

describe('fitsInQuota', () => {
  const estimate = (usage: number, quota: number): StorageEstimate => ({ usage, quota });

  it('accepts a record that fits inside the allowed share', () => {
    // 10 GB free, half of it claimable → 500 MB is comfortable.
    expect(fitsInQuota(500 * MB, estimate(0, 10 * GB))).toBe(true);
  });

  it('refuses a record larger than the share, even when it would technically fit', () => {
    // 800 MB free and the record is 600 MB: it would squeeze in, but filling
    // the last of the quota is what triggers eviction elsewhere.
    expect(fitsInQuota(600 * MB, estimate(200 * MB, GB))).toBe(false);
  });

  it('counts existing usage against the free space', () => {
    const almostFull = estimate(9.9 * GB, 10 * GB);
    expect(fitsInQuota(500 * MB, almostFull)).toBe(false);
    expect(fitsInQuota(500 * MB, estimate(0, 10 * GB))).toBe(true);
  });

  it('sits exactly on the share boundary without tipping over', () => {
    const free = GB;
    expect(fitsInQuota(free * QUOTA_SHARE, estimate(0, free))).toBe(true);
    expect(fitsInQuota(free * QUOTA_SHARE + 1, estimate(0, free))).toBe(false);
  });

  it('refuses everything when usage already exceeds the quota', () => {
    // Browsers can report this after a quota is lowered; the subtraction must
    // not go negative and start accepting again.
    expect(fitsInQuota(1, estimate(2 * GB, GB))).toBe(false);
    expect(fitsInQuota(0, estimate(2 * GB, GB))).toBe(true);
  });

  it('allows the write when the browser will not say', () => {
    // No estimate is not a reason to disable caching — the QuotaExceededError
    // path still catches an actual overflow. This is only the pre-flight.
    expect(fitsInQuota(500 * MB, null)).toBe(true);
    expect(fitsInQuota(500 * MB, {})).toBe(true);
    expect(fitsInQuota(500 * MB, { usage: 0 })).toBe(true);
    expect(fitsInQuota(500 * MB, { quota: GB })).toBe(true);
  });

  it('keeps a full-body study out of a modest quota', () => {
    // The case from the review: ~660 MB against a 1 GB origin quota.
    const { volume, prepared3D, histogram } = parts(512 * 512 * 996 * 2, 512 ** 3, 1024);
    const bytes = recordBytes(volume, prepared3D, histogram);
    expect(fitsInQuota(bytes, estimate(0, GB))).toBe(false);
    expect(fitsInQuota(bytes, estimate(0, 50 * GB))).toBe(true);
  });
});

describe('recordBuffer', () => {
  it('hands over a buffer the view spans whole, without copying', () => {
    const voxels = new Int16Array([1, 2, 3]);
    expect(recordBuffer(voxels)).toBe(voxels.buffer);
  });

  it('slices out a partial view', () => {
    const backing = new Uint8Array([9, 1, 2, 3, 9]);
    const view = backing.subarray(1, 4);
    const out = recordBuffer(view);
    expect(out).not.toBe(backing.buffer);
    expect(Array.from(new Uint8Array(out))).toEqual([1, 2, 3]);
  });
});

describe('keeping the series of a study', () => {
  const file = (name: string, bytes: number) => new File([new Uint8Array(bytes)], name);
  const meta = (over: Partial<StoredSeriesMeta> = {}): StoredSeriesMeta => ({
    id: 'tab:series',
    timestamp: 0,
    list: [
      { key: 'a', label: 'T1', count: 5, rows: 2, columns: 2 },
      { key: 'b', label: 'T2', count: 5, rows: 2, columns: 2 },
    ],
    activeKey: 'b',
    volumeIds: { a: 'vol-a', b: 'vol-b' },
    rootName: 'study',
    filesToken: 'tok',
    ...over,
  });
  const files = (token = 'tok'): StoredSeriesFiles => ({
    id: 'tab:series-files',
    timestamp: 0,
    token,
    files: [{ path: 'x/1.dcm', name: '1.dcm', file: file('1.dcm', 10) }],
  });

  it('counts what the files of a study cost', () => {
    const source = {
      rootName: 's',
      files: [
        { path: 'a', name: 'a', file: file('a', 300) },
        { path: 'b', name: 'b', file: file('b', 700) },
      ],
    };
    expect(filesBytes(source)).toBe(1000);
  });

  it('rebuilds the study from its two records', () => {
    const series = seriesFromRecords(meta(), files());
    expect(series?.list.map((s) => s.key)).toEqual(['a', 'b']);
    expect(series?.activeKey).toBe('b');
    expect(series?.volumeIds).toEqual({ a: 'vol-a', b: 'vol-b' });
    expect(series?.source.rootName).toBe('study');
    expect(series?.source.files).toHaveLength(1);
  });

  it('gives nothing back when a record is missing', () => {
    expect(seriesFromRecords(undefined, files())).toBeUndefined();
    expect(seriesFromRecords(meta(), undefined)).toBeUndefined();
  });

  it('gives nothing back when the files belong to another study', () => {
    // A write interrupted between the two records leaves a list and files that disagree.
    expect(seriesFromRecords(meta({ filesToken: 'old' }), files('new'))).toBeUndefined();
  });

  it('gives nothing back for a single series — there is nothing to switch to', () => {
    expect(seriesFromRecords(meta({ list: meta().list.slice(0, 1) }), files())).toBeUndefined();
  });
});
