import type { ImportSource, LoadResult } from '@prisma-mri/viewer-core';
import { describe, expect, it, vi } from 'vitest';
import { createViewer } from './createViewer';
import type { VolumeLoadRunner } from './loader';

const SOURCE: ImportSource = {
  rootName: 'test',
  files: [{ path: 'a.nrrd', name: 'a.nrrd', file: new File([new Uint8Array(4)], 'a.nrrd') }],
};

const result: LoadResult = {
  volume: {
    voxels: new Float32Array(8),
    meta: { dims: [2, 2, 2], spacing: [1, 1, 1], origin: [0, 0, 0], bitsAllocated: 16 },
    scalarMin: 0,
    scalarMax: 1,
    windowLevel: { window: 1, level: 0.5 },
    formatId: 'nrrd',
  },
  prepared3D: {
    data: new Uint8Array(8),
    dims: [2, 2, 2],
    spacing: [1, 1, 1],
    clim: [0, 255],
    threshold: 0.5,
    sourceRange: [0, 1],
    sourceDims: [2, 2, 2],
  },
  histogram: { bins: new Uint32Array(4), min: 0, max: 1, count: 8 },
};

const loaded: VolumeLoadRunner = async () => ({ kind: 'volume', result });
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('events', () => {
  it('reports state changes once, with the new value', async () => {
    const viewer = createViewer({ runLoad: loaded });
    const cursor = vi.fn();
    const status = vi.fn();
    viewer.on('cursorchange', cursor);
    viewer.on('statuschange', status);

    await viewer.load(SOURCE);
    expect(status).toHaveBeenCalledWith('ready');
    expect(cursor).toHaveBeenCalledTimes(1);

    cursor.mockClear();
    viewer.setCursor({ x: 1, y: 0, z: 0 });
    viewer.setSlabMm(3); // not a cursor change
    expect(cursor).toHaveBeenCalledTimes(1);
    expect(cursor).toHaveBeenCalledWith({ x: 1, y: 0, z: 0 });
  });

  it('fires loaded with the result, and error with the message', async () => {
    const onLoaded = vi.fn();
    const onError = vi.fn();
    const failing: VolumeLoadRunner = async () => {
      throw new Error('bad file');
    };
    const ok = createViewer({ runLoad: loaded });
    ok.on('loaded', onLoaded);
    await ok.load(SOURCE);
    expect(onLoaded).toHaveBeenCalledWith(result);

    const bad = createViewer({ runLoad: failing });
    bad.on('error', onError);
    await bad.load(SOURCE);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toContain('bad file');

    bad.setError(null);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('stops after the returned function is called', () => {
    const viewer = createViewer();
    const handler = vi.fn();
    const off = viewer.on('presetchange', handler);
    off();
    viewer.setRenderPreset('bone');
    expect(handler).not.toHaveBeenCalled();
  });

  it('survives a throwing handler', () => {
    const viewer = createViewer();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    viewer.on('presetchange', () => {
      throw new Error('host bug');
    });
    viewer.on('presetchange', after);
    expect(() => viewer.setRenderPreset('bone')).not.toThrow();
    expect(after).toHaveBeenCalledWith('bone');
    spy.mockRestore();
  });
});

describe('dispose', () => {
  it('drops every listener the host attached', async () => {
    const viewer = createViewer({ runLoad: loaded });
    const on = vi.fn();
    const sub = vi.fn();
    const loadedListener = vi.fn();
    viewer.on('cursorchange', on);
    viewer.subscribe(sub);
    viewer.onVolumeLoaded(loadedListener);

    viewer.dispose();
    await viewer.load(SOURCE);
    viewer.setCursor({ x: 1, y: 1, z: 1 });

    expect(on).not.toHaveBeenCalled();
    expect(sub).not.toHaveBeenCalled();
    expect(loadedListener).not.toHaveBeenCalled();
  });

  it('aborts the load in flight, even when the runner ignores the signal', async () => {
    let release: () => void = () => {};
    let signal: AbortSignal | undefined;
    const slow: VolumeLoadRunner = (_s, _p, sig) => {
      signal = sig;
      return new Promise((resolve) => {
        release = () => resolve({ kind: 'volume', result });
      });
    };
    const viewer = createViewer({ runLoad: slow });
    const pending = viewer.load(SOURCE);
    await settle();
    expect(viewer.getSnapshot().status).toBe('loading');

    viewer.dispose();
    expect(signal?.aborted).toBe(true);
    release();
    await pending;

    expect(viewer.getSnapshot().volume).toBeNull();
    expect(viewer.getSnapshot().loading.active).toBe(false);
  });

  it('dismisses an open series choice', async () => {
    const choice: VolumeLoadRunner = async (source) => ({
      kind: 'series-choice',
      series: [{ key: 's1', label: 's1', count: 1, rows: 2, columns: 2 }],
      source,
    });
    const viewer = createViewer({ runLoad: choice });
    const pending = viewer.load(SOURCE);
    await settle();
    expect(viewer.getSnapshot().pendingSeries).not.toBeNull();
    viewer.dispose();
    await pending;
    expect(viewer.getSnapshot().pendingSeries).toBeNull();
  });

  it('is safe twice, and the viewer can be used again afterwards', async () => {
    const viewer = createViewer({ runLoad: loaded });
    viewer.dispose();
    viewer.dispose();
    const handler = vi.fn();
    viewer.on('statuschange', handler);
    await viewer.load(SOURCE);
    expect(handler).toHaveBeenCalledWith('ready');
  });
});
