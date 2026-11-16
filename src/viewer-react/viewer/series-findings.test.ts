/**
 * A study with several series: findings stay with the series they were placed
 * on, the viewer knows about those on the series that is not on screen, and
 * jumping to one switches the series first.
 */
import type { Annotation, ImportSource, LoadResult, SeriesChoice } from '@prisma-mri/viewer-core';
import { describe, expect, it } from 'vitest';
import type { ViewerSeriesContext } from './api';
import { createViewer, getViewerStore } from './createViewer';
import type { VolumeLoadRunner } from './loader';

const SOURCE: ImportSource = {
  rootName: 'study',
  files: [{ path: 'a.dcm', name: 'a.dcm', file: new File([new Uint8Array(4)], 'a.dcm') }],
};

const series = (key: string): SeriesChoice => ({
  key,
  label: `Series ${key}`,
  count: 1,
  rows: 2,
  columns: 2,
});
const SERIES = [series('1'), series('2'), series('3')];

/** Depth = the series key, so each series is a different volume with its own ID. */
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
    prepared3D: {} as never,
    histogram: {} as never,
  };
}

const runLoad: VolumeLoadRunner = async (source, _progress, _signal, key) =>
  key
    ? { kind: 'volume', result: result(Number(key) + 1) }
    : { kind: 'series-choice', series: SERIES, source };

const settle = () => new Promise((r) => setTimeout(r, 0));

const finding = (id: string, label: string): Omit<Annotation, 'volumeId'> => ({
  id,
  plane: 'axial',
  fx: 0.5,
  fy: 0.5,
  voxel: { x: 1, y: 1, z: 1 },
  label,
  severity: 'moderate',
});

/** A viewer with series 1 open. */
async function open() {
  const viewer = createViewer({ runLoad });
  const loading = viewer.load(SOURCE);
  await settle();
  viewer.resolveSeries('1');
  await loading;
  return viewer;
}

describe('findings across series', () => {
  it('tags a finding with the series it was placed on', async () => {
    const viewer = await open();
    viewer.addAnnotation(finding('a', 'on one'));
    expect(viewer.getSnapshot().annotations[0].seriesKey).toBe('1');
  });

  it('knows the findings of the series that is not on screen', async () => {
    const viewer = await open();
    viewer.addAnnotation(finding('a', 'on one'));

    await viewer.switchSeries('2');
    viewer.addAnnotation(finding('b', 'on two'));

    const snapshot = viewer.getSnapshot();
    expect(snapshot.activeSeriesKey).toBe('2');
    expect(snapshot.annotations.map((a) => a.id)).toEqual(['b']);
    expect(snapshot.otherSeriesAnnotations.map((a) => [a.id, a.seriesKey])).toEqual([['a', '1']]);
  });

  it('collects the findings of every series shown, never the one on screen twice', async () => {
    const viewer = await open();
    viewer.addAnnotation(finding('a', 'one'));
    await viewer.switchSeries('2');
    viewer.addAnnotation(finding('b', 'two'));
    await viewer.switchSeries('3');
    viewer.addAnnotation(finding('c', 'three'));

    const snapshot = viewer.getSnapshot();
    expect(snapshot.annotations.map((a) => a.id)).toEqual(['c']);
    expect(snapshot.otherSeriesAnnotations.map((a) => a.id).sort()).toEqual(['a', 'b']);
  });

  it('switches series, then focuses, when asked for a finding on another series', async () => {
    const viewer = await open();
    viewer.addAnnotation(finding('a', 'on one'));
    await viewer.switchSeries('2');
    viewer.addAnnotation(finding('b', 'on two'));

    viewer.focusAnnotation('a');
    await settle();
    await settle();

    const snapshot = viewer.getSnapshot();
    expect(snapshot.activeSeriesKey).toBe('1');
    expect(snapshot.activeAnnotationId).toBe('a');
    expect(snapshot.otherSeriesAnnotations.map((a) => a.id)).toEqual(['b']);
  });

  it('focuses a finding on the series already shown without switching', async () => {
    const viewer = await open();
    viewer.addAnnotation(finding('a', 'on one'));

    viewer.focusAnnotation('a');

    const snapshot = viewer.getSnapshot();
    expect(snapshot.activeSeriesKey).toBe('1');
    expect(snapshot.activeAnnotationId).toBe('a');
  });

  it('knows no other series for a single-series volume', async () => {
    const viewer = createViewer({
      runLoad: async () => ({ kind: 'volume', result: result(2) }),
    });
    await viewer.load(SOURCE);
    viewer.addAnnotation(finding('a', 'only'));

    const snapshot = viewer.getSnapshot();
    expect(snapshot.seriesList).toBeNull();
    expect(snapshot.otherSeriesAnnotations).toEqual([]);
    expect(snapshot.annotations[0].seriesKey).toBeUndefined();
  });

  it('forgets the study when another source is opened', async () => {
    const viewer = await open();
    viewer.addAnnotation(finding('a', 'on one'));
    await viewer.switchSeries('2');

    // The same series keys in a different source are a different study.
    const second = viewer.load({ ...SOURCE, rootName: 'other' });
    await settle();
    viewer.resolveSeries('1');
    await second;

    expect(viewer.getSnapshot().otherSeriesAnnotations).toEqual([]);
  });
});

describe('the series switch in progress', () => {
  /** A runner that holds every series load until the test lets it go. */
  function held() {
    const waiting: { key: string; finish: () => void; fail: (e: Error) => void }[] = [];
    let hold = false;
    const run: VolumeLoadRunner = (source, _progress, _signal, key) => {
      if (!key) return Promise.resolve({ kind: 'series-choice', series: SERIES, source });
      if (!hold) return Promise.resolve({ kind: 'volume', result: result(Number(key) + 1) });
      return new Promise((resolve, reject) => {
        waiting.push({
          key,
          finish: () => resolve({ kind: 'volume', result: result(Number(key) + 1) }),
          fail: reject,
        });
      });
    };
    return {
      run,
      waiting,
      hold: () => {
        hold = true;
      },
    };
  }

  async function openHeld() {
    const gate = held();
    const viewer = createViewer({ runLoad: gate.run });
    const loading = viewer.load(SOURCE);
    await settle();
    viewer.resolveSeries('1');
    await loading;
    gate.hold();
    return { viewer, gate, switching: () => getViewerStore(viewer).getState().switchingSeriesKey };
  }

  it('is flagged from the start of the switch until the series is on screen', async () => {
    const { viewer, gate, switching } = await openHeld();
    expect(switching()).toBeNull();

    const done = viewer.switchSeries('2');
    expect(switching()).toBe('2');

    await settle();
    gate.waiting[0].finish();
    await done;
    expect(switching()).toBeNull();
    expect(viewer.getSnapshot().activeSeriesKey).toBe('2');
  });

  it('is cleared when the series fails to load', async () => {
    const { viewer, gate, switching } = await openHeld();
    const done = viewer.switchSeries('2');
    await settle();
    gate.waiting[0].fail(new Error('bad series'));
    await done;
    expect(switching()).toBeNull();
    expect(viewer.getSnapshot().activeSeriesKey).toBe('1');
  });

  it('stays set through a second switch that replaces the first, until the last one ends', async () => {
    const { viewer, gate, switching } = await openHeld();
    const first = viewer.switchSeries('2');
    await settle();
    const second = viewer.switchSeries('3');
    await settle();
    expect(switching()).toBe('3');

    // The replaced load coming back must not clear the flag of the one still going.
    gate.waiting[0].finish();
    await first;
    expect(switching()).toBe('3');

    gate.waiting[1].finish();
    await second;
    expect(switching()).toBeNull();
    expect(viewer.getSnapshot().activeSeriesKey).toBe('3');
  });

  it('is not set when there is nothing to switch to', async () => {
    const { viewer, switching } = await openHeld();
    await viewer.switchSeries('1');
    expect(switching()).toBeNull();
  });
});

describe('reopening a study from a host cache', () => {
  /** Findings kept outside the viewer, as a host with its own storage would. */
  function sharedStorage() {
    const slots = new Map<string, Annotation[]>();
    return {
      load: (id: string) => slots.get(id) ?? [],
      save: (id: string, list: Annotation[]) => void slots.set(id, list),
      clear: (id: string) => void slots.delete(id),
    };
  }

  /** What a host caches on each load: the volume and the study's series. */
  async function cached() {
    const annotationStorage = sharedStorage();
    const first = createViewer({ runLoad, annotationStorage });
    let last: { result: LoadResult; series: ViewerSeriesContext | null } | null = null;
    first.onVolumeLoaded((result, series) => {
      last = { result, series };
    });
    const loading = first.load(SOURCE);
    await settle();
    first.resolveSeries('1');
    await loading;
    first.addAnnotation(finding('a', 'on one'));
    await first.switchSeries('2');
    first.addAnnotation(finding('b', 'on two'));
    if (!last) throw new Error('nothing loaded');
    return {
      annotationStorage,
      ...(last as { result: LoadResult; series: ViewerSeriesContext | null }),
    };
  }

  it('hands the study to a host listener with each volume', async () => {
    const { series } = await cached();
    expect(series?.list.map((s) => s.key)).toEqual(['1', '2', '3']);
    expect(series?.activeKey).toBe('2');
    expect(Object.keys(series?.volumeIds ?? {}).sort()).toEqual(['1', '2']);
  });

  it('brings the series selector and the other series’ findings back', async () => {
    const { annotationStorage, result, series } = await cached();

    const reopened = createViewer({ runLoad, annotationStorage });
    reopened.restoreVolume(result, series ?? undefined);

    const snapshot = reopened.getSnapshot();
    expect(snapshot.seriesList?.map((s) => s.key)).toEqual(['1', '2', '3']);
    expect(snapshot.activeSeriesKey).toBe('2');
    expect(snapshot.annotations.map((a) => a.id)).toEqual(['b']);
    expect(snapshot.otherSeriesAnnotations.map((a) => [a.id, a.seriesKey])).toEqual([['a', '1']]);
  });

  it('can switch series again after the study was restored', async () => {
    const { annotationStorage, result, series } = await cached();
    const reopened = createViewer({ runLoad, annotationStorage });
    reopened.restoreVolume(result, series ?? undefined);

    await reopened.switchSeries('1');

    expect(reopened.getSnapshot().activeSeriesKey).toBe('1');
    expect(reopened.getSnapshot().annotations.map((a) => a.id)).toEqual(['a']);
  });

  it('has no series to offer when restored without the study', async () => {
    const { annotationStorage, result } = await cached();
    const reopened = createViewer({ runLoad, annotationStorage });
    reopened.restoreVolume(result);
    expect(reopened.getSnapshot().seriesList).toBeNull();
  });
});
