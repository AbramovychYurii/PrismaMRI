/**
 * @vitest-environment happy-dom
 *
 * The measurement distance is the one number in this app a person might read
 * and act on, so it gets its own file. happy-dom is needed only because the store
 * persists UI state to sessionStorage — the arithmetic under test is pure.
 */
import { useVolumeStore } from '@/store/volumeStore';
import type { LoadedVolume, Vec3 } from '@/types';
import { beforeEach, describe, expect, it } from 'vitest';

function volumeWithSpacing(spacing: Vec3): LoadedVolume {
  return {
    voxels: new Float32Array(8),
    meta: { dims: [2, 2, 2], spacing, origin: [0, 0, 0], bitsAllocated: 16 },
    scalarMin: 0,
    scalarMax: 1,
    windowLevel: { window: 1, level: 0.5 },
    formatId: 'nrrd',
  };
}

/** Distance in mm between two voxels under the given spacing. */
function measure(spacing: Vec3 | null, from: Vec3, to: Vec3): number | null {
  useVolumeStore.setState({ volume: spacing ? volumeWithSpacing(spacing) : null });
  const { setMeasurementFrom, setMeasurementTo } = useVolumeStore.getState();
  setMeasurementFrom({ x: from[0], y: from[1], z: from[2] });
  setMeasurementTo({ x: to[0], y: to[1], z: to[2] });
  return useVolumeStore.getState().measurement?.distanceMm ?? null;
}

beforeEach(() => {
  useVolumeStore.setState({ measurement: null, volume: null });
});

describe('measurement distance', () => {
  it('is the Euclidean distance at 1 mm isotropic spacing', () => {
    expect(measure([1, 1, 1], [0, 0, 0], [3, 4, 0])).toBeCloseTo(5);
    expect(measure([1, 1, 1], [0, 0, 0], [1, 2, 2])).toBeCloseTo(3);
  });

  it('scales each axis by its own spacing, not by voxel count', () => {
    // 3 voxels along x at 2 mm each is 6 mm. Ignoring spacing would report 3 —
    // the failure mode that silently halves or doubles a reported size.
    expect(measure([2, 1, 1], [0, 0, 0], [3, 0, 0])).toBeCloseTo(6);
    expect(measure([1, 0.5, 1], [0, 0, 0], [0, 4, 0])).toBeCloseTo(2);
    expect(measure([1, 1, 3], [0, 0, 0], [0, 0, 2])).toBeCloseTo(6);
  });

  it('combines anisotropic axes correctly', () => {
    // (3·2)² + (4·0.5)² = 36 + 4 → √40
    expect(measure([2, 0.5, 1], [0, 0, 0], [3, 4, 0])).toBeCloseTo(Math.sqrt(40));
  });

  it('is symmetric', () => {
    const forward = measure([0.8, 1.25, 3], [1, 1, 0], [4, 5, 2]);
    const backward = measure([0.8, 1.25, 3], [4, 5, 2], [1, 1, 0]);
    expect(forward).toBeCloseTo(backward as number);
  });

  it('is zero for a point measured against itself', () => {
    expect(measure([2, 3, 4], [1, 1, 1], [1, 1, 1])).toBe(0);
  });

  it('falls back to 1 mm spacing when no volume is open', () => {
    expect(measure(null, [0, 0, 0], [3, 4, 0])).toBeCloseTo(5);
  });
});

describe('measurement lifecycle', () => {
  it('leaves the distance unresolved until the second point lands', () => {
    useVolumeStore.setState({ volume: volumeWithSpacing([1, 1, 1]) });
    useVolumeStore.getState().setMeasurementFrom({ x: 0, y: 0, z: 0 });
    const m = useVolumeStore.getState().measurement;
    expect(m?.from).toEqual({ x: 0, y: 0, z: 0 });
    expect(m?.to).toBeNull();
    expect(m?.distanceMm).toBeNull();
  });

  it('ignores a second point when no first point was placed', () => {
    useVolumeStore.setState({ volume: volumeWithSpacing([1, 1, 1]), measurement: null });
    useVolumeStore.getState().setMeasurementTo({ x: 5, y: 5, z: 5 });
    expect(useVolumeStore.getState().measurement).toBeNull();
  });

  it('starts a fresh measurement rather than extending the old one', () => {
    useVolumeStore.setState({ volume: volumeWithSpacing([1, 1, 1]) });
    const { setMeasurementFrom, setMeasurementTo } = useVolumeStore.getState();
    setMeasurementFrom({ x: 0, y: 0, z: 0 });
    setMeasurementTo({ x: 3, y: 4, z: 0 });
    setMeasurementFrom({ x: 1, y: 1, z: 1 });
    const m = useVolumeStore.getState().measurement;
    expect(m?.from).toEqual({ x: 1, y: 1, z: 1 });
    expect(m?.to).toBeNull();
    expect(m?.distanceMm).toBeNull();
  });

  it('clears completely', () => {
    useVolumeStore.setState({ volume: volumeWithSpacing([1, 1, 1]) });
    const { setMeasurementFrom, setMeasurementTo, clearMeasurement } = useVolumeStore.getState();
    setMeasurementFrom({ x: 0, y: 0, z: 0 });
    setMeasurementTo({ x: 1, y: 1, z: 1 });
    clearMeasurement();
    expect(useVolumeStore.getState().measurement).toBeNull();
  });
});

describe('cursor clamping', () => {
  it('never lets the cursor leave the volume', () => {
    useVolumeStore.setState({ volume: volumeWithSpacing([1, 1, 1]) }); // dims 2×2×2
    const { setCursor } = useVolumeStore.getState();
    setCursor({ x: 99, y: -4, z: 1 });
    expect(useVolumeStore.getState().cursor).toEqual({ x: 1, y: 0, z: 1 });
  });

  it('passes the cursor through untouched when no volume is open', () => {
    useVolumeStore.setState({ volume: null });
    useVolumeStore.getState().setCursor({ x: 99, y: -4, z: 1 });
    expect(useVolumeStore.getState().cursor).toEqual({ x: 99, y: -4, z: 1 });
  });
});
