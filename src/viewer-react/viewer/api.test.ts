import type { LoadedVolume } from '@prisma-mri/viewer-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ViewerApi, createViewerApi } from './api';
import { type ViewerStore, createViewerStore } from './store';

const volume: LoadedVolume = {
  voxels: new Float32Array(8),
  meta: { dims: [2, 2, 2], spacing: [2, 1, 1], origin: [0, 0, 0], bitsAllocated: 16 },
  scalarMin: 0,
  scalarMax: 1,
  windowLevel: { window: 1, level: 0.5 },
  formatId: 'nrrd',
};

const finding = {
  id: 'a',
  plane: 'axial' as const,
  fx: 0.5,
  fy: 0.5,
  voxel: { x: 1, y: 1, z: 1 },
  label: 'Lesion',
  severity: 'moderate' as const,
};

let store: ViewerStore;
let api: ViewerApi;

beforeEach(() => {
  store = createViewerStore();
  api = createViewerApi(store);
  store.setState({ volume, cursor: { x: 0, y: 0, z: 0 }, activeVolumeId: 'v1' });
});

describe('snapshot', () => {
  it('is the same object until something it shows changes', () => {
    const first = api.getSnapshot();
    expect(api.getSnapshot()).toBe(first);
    // UI plumbing the facade does not expose must not make a new snapshot.
    store.getState().setMobileTab('axial');
    store.getState().requestSnapToView('sagittal');
    expect(api.getSnapshot()).toBe(first);
    api.setSlabMm(4);
    expect(api.getSnapshot()).not.toBe(first);
    expect(api.getSnapshot().slabMm).toBe(4);
  });

  it('reports empty, loading and ready', () => {
    const fresh = createViewerStore();
    const view = createViewerApi(fresh);
    expect(view.getSnapshot().status).toBe('empty');
    fresh.getState().setLoading({ active: true });
    expect(view.getSnapshot().status).toBe('loading');
    fresh.setState({ volume });
    expect(view.getSnapshot().status).toBe('ready');
  });

  it('shows focus mode and the dock', () => {
    expect(api.getSnapshot().focusMode).toBe(false);
    store.getState().toggleToolbar('focus');
    store.getState().toggleToolbar('dock');
    expect(api.getSnapshot()).toMatchObject({ focusMode: true, dockOpen: false });
  });

  it('exposes no raw store field', () => {
    const keys = Object.keys(api.getSnapshot());
    for (const hidden of ['wl', 'wlDraft', 'snapSeq', 'mobileTab', 'scrubVisible', 'toolbar']) {
      expect(keys).not.toContain(hidden);
    }
  });
});

describe('subscribe', () => {
  it('calls back with the new and previous snapshot, only on change', () => {
    const listener = vi.fn();
    const stop = api.subscribe(listener);
    const before = api.getSnapshot();

    store.getState().setMobileTab('coronal');
    expect(listener).not.toHaveBeenCalled();

    api.setCursor({ x: 1, y: 0, z: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
    const [next, previous] = listener.mock.calls[0];
    expect(previous).toBe(before);
    expect(next.cursor).toEqual({ x: 1, y: 0, z: 0 });

    stop();
    api.setCursor({ x: 0, y: 1, z: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('serves several subscribers at once', () => {
    const a = vi.fn();
    const b = vi.fn();
    api.subscribe(a);
    api.subscribe(b);
    api.setSlabMm(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe('commands', () => {
  it('sets window and level together with the live drag value', () => {
    api.setWindowLevel({ window: 300, level: 40 });
    expect(api.getSnapshot().windowLevel).toEqual({ window: 300, level: 40 });
    expect(store.getState().wlDraft).toEqual({ window: 300, level: 40 });
  });

  it('places a measurement in one call and computes its length from the spacing', () => {
    api.setMeasurement({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(api.getSnapshot().measurement?.distanceMm).toBeCloseTo(2);
    api.clearMeasurement();
    expect(api.getSnapshot().measurement).toBeNull();
  });

  it('adds, activates, replaces and removes findings', () => {
    api.addAnnotation(finding);
    api.setActiveAnnotation('a');
    expect(api.getSnapshot().annotations).toHaveLength(1);
    expect(api.getSnapshot().activeAnnotationId).toBe('a');
    expect(api.getSnapshot().annotations[0].volumeId).toBe('v1');

    api.replaceAnnotations([finding, { ...finding, id: 'b' }]);
    expect(api.getSnapshot().annotations.map((a) => a.id)).toEqual(['a', 'b']);

    api.removeAnnotation('a');
    expect(api.getSnapshot().annotations.map((a) => a.id)).toEqual(['b']);
    api.clearAnnotations();
    expect(api.getSnapshot().annotations).toEqual([]);
  });

  it('jumps to a finding', () => {
    api.addAnnotation(finding);
    api.focusAnnotation('a');
    expect(api.getSnapshot()).toMatchObject({ cursor: finding.voxel, activeAnnotationId: 'a' });
  });

  it('keeps UI state when a volume is restored', () => {
    api.setSlabMm(6);
    api.setCursor({ x: 1, y: 1, z: 1 });
    api.restoreVolume({
      volume,
      prepared3D: {} as never,
      histogram: {} as never,
    });
    expect(api.getSnapshot()).toMatchObject({ slabMm: 6, cursor: { x: 1, y: 1, z: 1 } });
  });

  it('finishes loading, reports and clears errors, resets', () => {
    store.getState().setLoading({ active: true, percent: 40 });
    api.finishLoading();
    expect(api.getSnapshot().loading).toMatchObject({ active: false, percent: 100 });
    api.setError('boom');
    expect(api.getSnapshot().error).toBe('boom');
    api.setError(null);
    expect(api.getSnapshot().error).toBeNull();
    api.reset();
    expect(api.getSnapshot().status).toBe('empty');
  });
});
