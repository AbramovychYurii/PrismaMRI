import type { Annotation, ImportSource, LoadResult, SeriesChoice } from '@prisma-mri/viewer-core';
import { createViewer } from '@prisma-mri/viewer-react';
import { describe, expect, it } from 'vitest';
import { runHandler } from './handler-test-utils';
import { MCP_HANDLERS } from './handlers';

const SOURCE: ImportSource = {
  rootName: 'study',
  files: [{ path: 'a.dcm', name: 'a.dcm', file: new File([new Uint8Array(4)], 'a.dcm') }],
};

const series = (key: string, label: string, orientation?: SeriesChoice['orientation']) => ({
  key,
  label,
  orientation,
  count: 5,
  rows: 2,
  columns: 2,
});
const SERIES: SeriesChoice[] = [
  series('uid-t1', 'T1 SAG', 'Sagittal'),
  series('uid-t2', 'T2 AX', 'Axial'),
  series('uid-fl', 'FLAIR', 'Axial'),
];

/** Depth = position in the list, so each series is a different volume. */
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

const settle = () => new Promise((r) => setTimeout(r, 0));

async function openStudy() {
  const viewer = createViewer({
    runLoad: async (source, _progress, _signal, key) =>
      key
        ? { kind: 'volume', result: result(SERIES.findIndex((s) => s.key === key) + 2) }
        : { kind: 'series-choice', series: SERIES, source },
  });
  const loading = viewer.load(SOURCE);
  await settle();
  viewer.resolveSeries('uid-t1');
  await loading;
  return viewer;
}

const finding = (id: string): Omit<Annotation, 'volumeId'> => ({
  id,
  plane: 'axial',
  fx: 0.5,
  fy: 0.5,
  voxel: { x: 1, y: 1, z: 1 },
  label: `finding ${id}`,
  severity: 'moderate',
});

type Viewer = ReturnType<typeof createViewer>;

const run = (viewer: Viewer, action: string, msg: Record<string, unknown> = {}) =>
  runHandler(MCP_HANDLERS[action], viewer, action, msg);

describe('list_series', () => {
  it('says so for a single-series volume', async () => {
    const viewer = createViewer({ runLoad: async () => ({ kind: 'volume', result: result(2) }) });
    await viewer.load(SOURCE);
    const r = (await run(viewer, 'list_series')).ok as {
      count: number;
      series: unknown[];
      note: string;
    };
    expect(r.count).toBe(0);
    expect(r.series).toEqual([]);
    expect(r.note).toMatch(/single series/);
  });

  it('lists the series with the open one marked and findings counted per series', async () => {
    const viewer = await openStudy();
    viewer.addAnnotation(finding('a'));
    await viewer.switchSeries('uid-t2');

    const r = (await run(viewer, 'list_series')).ok as {
      active: string;
      series: { index: number; label: string; active: boolean; findings: number }[];
    };
    expect(r.active).toBe('uid-t2');
    expect(r.series.map((s) => [s.index, s.label, s.active, s.findings])).toEqual([
      [1, 'T1 SAG', false, 1],
      [2, 'T2 AX', true, 0],
      [3, 'FLAIR', false, 0],
    ]);
  });
});

describe('switch_series', () => {
  it.each([
    ['by position', 3],
    ['by label', 'flair'],
    ['by key', 'uid-fl'],
    ['by position as text', '3'],
  ])('opens the series %s', async (_name, pick) => {
    const viewer = await openStudy();
    const r = await run(viewer, 'switch_series', { series: pick });
    expect(r.error).toBeUndefined();
    expect(r.ok).toMatchObject({ active: 'uid-fl', label: 'FLAIR', dims: [2, 2, 4] });
    expect(viewer.getSnapshot().activeSeriesKey).toBe('uid-fl');
  });

  it('names the choices when the series does not exist', async () => {
    const viewer = await openStudy();
    const r = await run(viewer, 'switch_series', { series: 'DWI' });
    expect(r.error).toMatch(/1 = T1 SAG; 2 = T2 AX; 3 = FLAIR/);
    expect(viewer.getSnapshot().activeSeriesKey).toBe('uid-t1');
  });

  it('refuses when the volume has a single series', async () => {
    const viewer = createViewer({ runLoad: async () => ({ kind: 'volume', result: result(2) }) });
    await viewer.load(SOURCE);
    expect((await run(viewer, 'switch_series', { series: 1 })).error).toMatch(/single series/);
  });
});

describe('findings across series, as the agent sees them', () => {
  it('list_annotations covers every series shown and says where each is', async () => {
    const viewer = await openStudy();
    viewer.addAnnotation(finding('a'));
    await viewer.switchSeries('uid-t2');
    viewer.addAnnotation(finding('b'));

    const r = (await run(viewer, 'list_annotations')).ok as {
      count: number;
      annotations: { id: string; series: string | null; onScreen: boolean }[];
    };
    expect(r.count).toBe(2);
    expect(r.annotations.map((a) => [a.id, a.series, a.onScreen])).toEqual([
      ['b', 'T2 AX', true],
      ['a', 'T1 SAG', false],
    ]);
  });

  it('remove_annotation tells which series to switch to for a finding that is not on screen', async () => {
    const viewer = await openStudy();
    viewer.addAnnotation(finding('a'));
    await viewer.switchSeries('uid-t2');

    const r = await run(viewer, 'remove_annotation', { id: 'a' });
    expect(r.error).toMatch(/T1 SAG/);
    expect(r.error).toMatch(/switch_series/);
  });

  it('get_state reports how many series there are and which is open', async () => {
    const viewer = await openStudy();
    const r = (await run(viewer, 'get_state')).ok as { series: unknown };
    expect(r.series).toEqual({ count: 3, active: 'T1 SAG' });
  });
});
