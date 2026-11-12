import { sourceOf } from '@/lib/import/fixtures';
import type { ImportSource, SeriesChoice } from '@/lib/import/types';
import type { LoadResult, LoadWorkerResult } from '@/lib/import/volume-client';
import { type ViewerLoader, type VolumeLoadRunner, createViewerLoader } from '@/viewer/loader';
import { type ViewerStore, createViewerStore } from '@/viewer/store';
import { describe, expect, it, vi } from 'vitest';

function result(depth: number): LoadResult {
  return {
    volume: {
      voxels: new Float32Array(4 * depth),
      meta: { dims: [2, 2, depth], spacing: [1, 1, 1], origin: [0, 0, 0], bitsAllocated: 16 },
      scalarMin: 0,
      scalarMax: 1,
      windowLevel: { window: 1, level: 0.5 },
      formatId: 'dicom',
    },
    prepared3D: {
      data: new Uint8Array(4 * depth),
      dims: [2, 2, depth],
      spacing: [1, 1, 1],
      clim: [0, 255],
      threshold: 0.5,
      sourceRange: [0, 1],
      sourceDims: [2, 2, depth],
    },
    histogram: { bins: new Uint32Array(4), min: 0, max: 1, count: 4 * depth },
  };
}

const series = (key: string): SeriesChoice => ({ key, label: key, count: 1, rows: 2, columns: 2 });
const SOURCE: ImportSource = sourceOf({ name: 'a.dcm', bytes: new Uint8Array(4) });
const TWO_SERIES = [series('s1'), series('s2')];

/** Volume depth = the series number, so each load is told apart in the store. */
const multiSeries: VolumeLoadRunner = async (source, _onProgress, _signal, seriesKey) =>
  seriesKey
    ? { kind: 'volume', result: result(Number(seriesKey.slice(1))) }
    : { kind: 'series-choice', series: TWO_SERIES, source };

function setup(runLoad: VolumeLoadRunner): { store: ViewerStore; loader: ViewerLoader } {
  const store = createViewerStore();
  return { store, loader: createViewerLoader(store, { runLoad }) };
}

/** Lets a pending load reach its next await (the series choice, the runner). */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('createViewerLoader', () => {
  it('puts the volume in the store and tells listeners within the same call', async () => {
    const { store, loader } = setup(async () => ({ kind: 'volume', result: result(3) }));
    const seen: number[] = [];
    loader.onVolumeLoaded(({ volume }) => {
      // Listeners run once the store already holds the volume.
      seen.push(store.getState().volume === volume ? volume.meta.dims[2] : -1);
    });

    await loader.load(SOURCE);

    expect(seen).toEqual([3]);
    expect(store.getState().volume?.meta.dims).toEqual([2, 2, 3]);
    // Left for the host to clear once its viewer screen is up.
    expect(store.getState().loading.active).toBe(true);
    expect(store.getState().seriesList).toBeNull();
  });

  it('waits for a series choice, then keeps the list for in-place switching', async () => {
    const { store, loader } = setup(multiSeries);
    const done = loader.load(SOURCE);
    await settle();

    expect(store.getState().pendingSeries).toEqual(TWO_SERIES);
    expect(store.getState().volume).toBeNull();

    loader.resolveSeries('s2');
    await done;

    expect(store.getState().pendingSeries).toBeNull();
    expect(store.getState().volume?.meta.dims[2]).toBe(2);
    expect(store.getState().seriesList).toEqual(TWO_SERIES);
    expect(store.getState().activeSeriesKey).toBe('s2');
  });

  it('cancelling the series choice loads nothing', async () => {
    const { store, loader } = setup(multiSeries);
    const done = loader.load(SOURCE);
    await settle();

    loader.cancel();
    await done;

    expect(store.getState().pendingSeries).toBeNull();
    expect(store.getState().volume).toBeNull();
    expect(store.getState().error).toBeNull();
  });

  it('switches series in place, and ignores the one already shown', async () => {
    const runLoad = vi.fn(multiSeries);
    const { store, loader } = setup(runLoad);
    const done = loader.load(SOURCE);
    await settle();
    loader.resolveSeries('s1');
    await done;
    runLoad.mockClear();

    loader.switchSeries('s1');
    expect(runLoad).not.toHaveBeenCalled();

    loader.switchSeries('s2');
    await settle();
    expect(runLoad).toHaveBeenCalledWith(
      SOURCE,
      expect.any(Function),
      expect.any(AbortSignal),
      's2',
      { maxTextureEdge: undefined },
    );
    expect(store.getState().volume?.meta.dims[2]).toBe(2);
    expect(store.getState().activeSeriesKey).toBe('s2');
  });

  it('a new load aborts the one in flight, which then reports nothing', async () => {
    const signals: AbortSignal[] = [];
    const runLoad: VolumeLoadRunner = (_source, _onProgress, signal) => {
      signals.push(signal as AbortSignal);
      if (signals.length === 2) return Promise.resolve({ kind: 'volume', result: result(2) });
      return new Promise<LoadWorkerResult>((_resolve, reject) =>
        signal?.addEventListener('abort', () =>
          reject(new DOMException('Load cancelled.', 'AbortError')),
        ),
      );
    };
    const { store, loader } = setup(runLoad);

    const first = loader.load(SOURCE);
    await loader.load(SOURCE);
    await first;

    expect(signals[0].aborted).toBe(true);
    expect(store.getState().volume?.meta.dims[2]).toBe(2);
    expect(store.getState().error).toBeNull();
  });

  it('turns a failed load into the error message and an error stage', async () => {
    const { store, loader } = setup(async () => {
      throw new Error('Unrecognized format.');
    });
    await loader.load(SOURCE);

    expect(store.getState().error).toBe('Unrecognized format.');
    expect(store.getState().loading).toMatchObject({ active: false, stage: 'error' });
  });

  it('hands the texture cap to every load, and refuses a nonsense one', async () => {
    const runLoad = vi.fn<VolumeLoadRunner>(async () => ({ kind: 'volume', result: result(1) }));
    const loader = createViewerLoader(createViewerStore(), { runLoad, maxTextureEdge: 256 });
    await loader.load(SOURCE);
    expect(runLoad.mock.calls[0][4]).toEqual({ maxTextureEdge: 256 });

    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => createViewerLoader(createViewerStore(), { maxTextureEdge: bad })).toThrow(
        'maxTextureEdge must be a positive integer',
      );
    }
  });

  it('stops calling a listener once it unsubscribes', async () => {
    const { loader } = setup(async () => ({ kind: 'volume', result: result(1) }));
    const listener = vi.fn();
    const unsubscribe = loader.onVolumeLoaded(listener);
    await loader.load(SOURCE);
    unsubscribe();
    await loader.load(SOURCE);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
