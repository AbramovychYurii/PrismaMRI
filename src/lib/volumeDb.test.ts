import { QUOTA_SHARE, fitsInQuota, recordBytes } from '@/lib/volumeDb';
import type { LoadedVolume, PreparedVolumeFor3D, VolumeHistogram } from '@/types';
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
