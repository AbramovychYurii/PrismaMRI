import type { LoadedVolume } from '@prisma-mri/viewer-core';
import { animalPhantom, crackPhantom, jawPhantom } from '@prisma-mri/viewer-core/unstable';
import { createViewer } from '@prisma-mri/viewer-react';
import { describe, expect, it } from 'vitest';
import { ANALYSIS_HANDLERS } from './analysis-handlers';
import { type HandlerResult, runHandler } from './handler-test-utils';

/** Runs one command against a viewer holding `volume`; resolves with what the agent would receive. */
async function run(
  volume: LoadedVolume,
  action: string,
  msg: Record<string, unknown> = {},
  viewer = createViewer(),
): Promise<HandlerResult> {
  if (!viewer.getSnapshot().volume) {
    viewer.restoreVolume({ volume, prepared3D: {} as never, histogram: {} as never });
  }
  return runHandler(ANALYSIS_HANDLERS[action], viewer, action, msg);
}

describe('analysis commands', () => {
  it('survey_subject describes the volume without naming it', async () => {
    const r = await run(animalPhantom(), 'survey_subject');
    const s = r.ok as { notes: string[]; declared: object };
    expect(s.notes.length).toBeGreaterThan(0);
    expect(s.declared).toBeDefined();
  });

  it('refuses when nothing is loaded', async () => {
    const r = await runHandler(ANALYSIS_HANDLERS.survey_subject, createViewer(), 'survey_subject');
    expect(r.error).toBe('No volume loaded');
  });

  it('find_objects then check_arrangement flags the tooth off the arch', async () => {
    const { volume } = jawPhantom({ ectopic: { index: 4, offCurveMm: 7, tiltDeg: 50 } });
    const viewer = createViewer();
    const found = await run(
      volume,
      'find_objects',
      { threshold: 1000, split_touching: true },
      viewer,
    );
    expect((found.ok as { found: number }).found).toBe(11);
    const arr = await run(volume, 'check_arrangement', { plane: 'axial' }, viewer);
    const items = (arr.ok as { items: { flags: string[] }[] }).items;
    expect(items.filter((i) => i.flags.length > 0).length).toBeGreaterThan(0);
  });

  it('axis_profile and check_arrangement ask for find_objects first', async () => {
    const volume = animalPhantom();
    expect((await run(volume, 'axis_profile', { object_id: 1 })).error).toMatch(/find_objects/);
    expect((await run(volume, 'check_arrangement')).error).toMatch(/find_objects/);
  });

  it('check_symmetry reports the side of a missing limb', async () => {
    const r = await run(animalPhantom({ missing: ['hindRight'] }), 'check_symmetry');
    const report = r.ok as { unmatched: { side: string }[] };
    expect(report.unmatched[0].side).toBe('left');
  });

  it('find_gaps returns the crack', async () => {
    const r = await run(crackPhantom({ widthMm: 1, angleDeg: 20 }), 'find_gaps');
    expect((r.ok as { candidates: unknown[] }).candidates.length).toBeGreaterThan(0);
  });

  it('roi_stats, line_profile and slice_curve answer with numbers', async () => {
    const volume = crackPhantom({});
    const viewer = createViewer();
    const roi = await run(
      volume,
      'roi_stats',
      { center: { x: 50, y: 40, z: 50 }, radius_mm: 3 },
      viewer,
    );
    expect((roi.ok as { mean: number }).mean).toBeGreaterThan(1000);
    const line = await run(
      volume,
      'line_profile',
      { from: { x: 0, y: 40, z: 50 }, to: { x: 139, y: 40, z: 50 } },
      viewer,
    );
    expect((line.ok as { values: number[] }).values.length).toBe(64);
    const curve = await run(volume, 'slice_curve', { axis: 'z', metric: 'area_above' }, viewer);
    expect((curve.ok as { values: number[] }).values.length).toBeGreaterThan(10);
  });

  it('rejects a malformed voxel with a sentence naming the field', async () => {
    const volume = crackPhantom({});
    await expect(
      run(volume, 'line_profile', { from: { x: 1 }, to: { x: 2, y: 2, z: 2 } }),
    ).rejects.toThrow(/from/);
  });
});
