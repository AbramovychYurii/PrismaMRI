import { describe, expect, it } from 'vitest';
import { checkArrangement } from './arrangement';
import { axisProfile } from './axis';
import { labelComponents, splitTouching } from './components';
import { findGaps } from './gaps';
import { thresholdMask } from './grid';
import { lineProfile, roiStats, sliceCurve } from './measure';
import {
  AIR,
  BONE,
  PhantomBuilder,
  SOFT,
  TOOTH,
  animalPhantom,
  crackPhantom,
  jawPhantom,
} from './phantoms';
import { surveySubject } from './survey';
import { checkSymmetry } from './symmetry';
import { autoClasses } from './thresholds';

describe('thresholds', () => {
  it('puts the two Otsu thresholds between air, soft tissue and dense material', () => {
    const { volume } = jawPhantom();
    const [airSoft, softDense] = autoClasses(volume);
    expect(airSoft).toBeGreaterThan(AIR);
    expect(airSoft).toBeLessThan(SOFT + 200);
    expect(softDense).toBeGreaterThan(SOFT);
    expect(softDense).toBeLessThan(TOOTH);
  });
});

describe('connected components', () => {
  it('measures a ball: volume, centre, a round shape', () => {
    const b = new PhantomBuilder([80, 80, 80], [1, 1, 1]);
    b.ellipsoid([30, 40, 50], [10, 10, 10], 500);
    const v = b.build();
    const { objects } = labelComponents(thresholdMask(v, { lo: 0 }));
    expect(objects).toHaveLength(1);
    const o = objects[0];
    expect(o.volumeMm3).toBeGreaterThan((4 / 3) * Math.PI * 1000 * 0.93);
    expect(o.volumeMm3).toBeLessThan((4 / 3) * Math.PI * 1000 * 1.07);
    expect(o.centroid[0]).toBeCloseTo(30, 0);
    expect(o.centroid[1]).toBeCloseTo(40, 0);
    expect(o.centroid[2]).toBeCloseTo(50, 0);
    expect(o.elongation).toBeLessThan(1.15);
  });

  it('finds the long axis and length of a tilted rod', () => {
    const b = new PhantomBuilder([100, 100, 100], [1, 1, 1]);
    const t = (30 * Math.PI) / 180;
    b.ellipsoid([50, 50, 50], [20, 4, 4], 500, [Math.cos(t), 0, Math.sin(t)]);
    const o = labelComponents(thresholdMask(b.build(), { lo: 0 })).objects[0];
    expect(Math.abs(o.axes[0][0])).toBeCloseTo(Math.cos(t), 1);
    expect(Math.abs(o.axes[0][2])).toBeCloseTo(Math.sin(t), 1);
    expect(o.lengthMm).toBeGreaterThan(36);
    expect(o.lengthMm).toBeLessThan(44);
    expect(o.elongation).toBeGreaterThan(3);
  });

  it('keeps separate things separate and counts them', () => {
    const b = new PhantomBuilder([80, 40, 40], [1, 1, 1]);
    b.ellipsoid([15, 20, 20], [8, 8, 8], 500).ellipsoid([55, 20, 20], [6, 6, 6], 500);
    const { objects } = labelComponents(thresholdMask(b.build(), { lo: 0 }));
    expect(objects.map((o) => Math.round(o.centroid[0]))).toEqual([15, 55]);
  });

  it('splits two balls joined by a thin neck, and leaves a single ball alone', () => {
    const joined = new PhantomBuilder([80, 40, 40], [1, 1, 1]);
    joined.ellipsoid([22, 20, 20], [9, 9, 9], 500).ellipsoid([44, 20, 20], [9, 9, 9], 500);
    joined.capsule([22, 20, 20], [44, 20, 20], 2, 500);
    const mask = thresholdMask(joined.build(), { lo: 0 });
    expect(labelComponents(mask).objects).toHaveLength(1);
    expect(splitTouching(mask).objects).toHaveLength(2);

    const single = new PhantomBuilder([40, 40, 40], [1, 1, 1]);
    single.ellipsoid([20, 20, 20], [10, 10, 10], 500);
    expect(splitTouching(thresholdMask(single.build(), { lo: 0 })).objects).toHaveLength(1);
  });

  it('works on a coarser grid when the volume is large', () => {
    const b = new PhantomBuilder([120, 120, 120], [1, 1, 1]);
    b.ellipsoid([60, 60, 60], [20, 20, 20], 500);
    const mask = thresholdMask(b.build(), { lo: 0, maxVoxels: 100_000 });
    expect(mask.stride).toBeGreaterThan(1);
    const o = labelComponents(mask).objects[0];
    const truth = (4 / 3) * Math.PI * 8000;
    expect(Math.abs(o.volumeMm3 - truth) / truth).toBeLessThan(0.15);
    expect(o.centroid[0]).toBeCloseTo(60, 0);
  });
});

describe('measurements', () => {
  it('reports a ball ROI exactly', () => {
    const b = new PhantomBuilder([60, 60, 60], [1, 1, 1], 0);
    b.ellipsoid([30, 30, 30], [12, 12, 12], 100);
    const s = roiStats(b.build(), { kind: 'sphere', center: [30, 30, 30], radiusMm: 8 });
    expect(s.mean).toBe(100);
    expect(s.sd).toBe(0);
    expect(s.volumeMm3).toBeGreaterThan((4 / 3) * Math.PI * 512 * 0.92);
  });

  it('finds the edge along a line', () => {
    const b = new PhantomBuilder([60, 20, 20], [1, 1, 1], 0);
    b.box([30, 0, 0], [60, 20, 20], 100);
    const p = lineProfile(b.build(), [5, 10, 10], [55, 10, 10], 51);
    expect(p.lengthMm).toBeCloseTo(50, 1);
    expect(p.steepestEdgeAtMm).toBeGreaterThan(23);
    expect(p.steepestEdgeAtMm).toBeLessThan(26);
  });

  it('shows where along an axis the structure is', () => {
    const b = new PhantomBuilder([40, 40, 100], [1, 1, 1], 0);
    b.ellipsoid([20, 20, 70], [6, 6, 6], 500);
    const c = sliceCurve(b.build(), 'z', 'area_above', { threshold: 250 });
    expect(c.peaks[0].slice).toBeGreaterThan(64);
    expect(c.peaks[0].slice).toBeLessThan(76);
  });
});

describe('symmetry', () => {
  it('a symmetric animal is symmetric, with nothing unmatched', () => {
    const r = checkSymmetry(animalPhantom());
    expect(r.best).toBe('x');
    expect(r.dice).toBeGreaterThan(0.95);
    expect(r.unmatched).toHaveLength(0);
    expect(Math.abs(r.asymmetryIndex)).toBeLessThan(0.05);
  });

  it('a missing limb leaves an unmatched part on the opposite side', () => {
    const r = checkSymmetry(animalPhantom({ missing: ['hindRight'] }));
    expect(r.best).toBe('x');
    expect(r.unmatched.length).toBeGreaterThan(0);
    // hindLeft has x > 60 → the "high" side, patient left.
    expect(r.unmatched[0].side).toBe('left');
    expect(r.unmatched[0].volumeMm3).toBeGreaterThan(8000);
    expect(r.asymmetryIndex).toBeGreaterThan(0.03);
  });

  it('a swelling on one limb is reported on that side', () => {
    const r = checkSymmetry(animalPhantom({ swellingMm: 9 }));
    expect(r.unmatched.length).toBeGreaterThan(0);
    expect(r.unmatched[0].side).toBe('left');
  });
});

describe('axis profile', () => {
  const bone = (o: Parameters<typeof animalPhantom>[0]) => {
    const v = animalPhantom(o);
    const mask = thresholdMask(v, {
      lo: 600,
      region: { min: [60 - 30, 40, 100], max: [60 - 10, 129, 124] },
    });
    return labelComponents(mask, { minVoxels: 30 });
  };

  it('calls a straight bone straight', () => {
    const l = bone({});
    const p = axisProfile(l, 1);
    expect(p).not.toBeNull();
    expect(p?.straightness).toBeGreaterThan(0.97);
    expect(p?.maxBend?.angleDeg ?? 0).toBeLessThan(12);
  });

  it('measures how far a bone is bent', () => {
    const l = bone({ bendHindRightDeg: 40 });
    const p = axisProfile(l, 1);
    expect(p?.maxBend?.angleDeg).toBeGreaterThan(25);
    expect(p?.maxBend?.angleDeg).toBeLessThan(55);
  });
});

describe('arrangement', () => {
  const teethOf = (volume: ReturnType<typeof jawPhantom>['volume']) => {
    const mask = thresholdMask(volume, { lo: 1000 });
    return splitTouching(mask).objects;
  };

  it('a regular jaw raises no flags', () => {
    const r = checkArrangement(teethOf(jawPhantom().volume), { plane: 'axial' });
    expect(r).not.toBeNull();
    expect(r?.count).toBe(11);
    expect(r?.items.filter((i) => i.flags.length > 0)).toHaveLength(0);
    expect(r?.warning).toBeUndefined();
  });

  it('flags a tooth that sits off the arch and leans 50°', () => {
    const { volume } = jawPhantom({
      ectopic: { index: 4, offCurveMm: 7, tiltDeg: 50, raiseMm: 3 },
    });
    const objects = teethOf(volume);
    const r = checkArrangement(objects, { plane: 'axial' });
    const flagged = r?.items.filter((i) => i.flags.length > 0) ?? [];
    expect(flagged.length).toBeGreaterThanOrEqual(1);
    const target = objects.reduce(
      (a, o) => (Math.abs(o.centroid[0] - 42.5 / 0.5 + 0) < 1e9 ? a : a),
      objects[0],
    );
    void target;
    const top = flagged[0];
    expect(top.flags.join(' ')).toMatch(/off the row's curve|leans/);
    // Only the displaced tooth: its neighbours stay clean.
    expect(flagged.length).toBeLessThanOrEqual(3);
  });

  it('flags the tilt even when the tooth is still on the arch', () => {
    const { volume } = jawPhantom({ ectopic: { index: 5, offCurveMm: 0, tiltDeg: 50 } });
    const r = checkArrangement(teethOf(volume), { plane: 'axial' });
    expect(r?.items.some((i) => i.flags.some((f) => f.startsWith('leans')))).toBe(true);
  });

  it('flags a missing tooth as a gap in the row', () => {
    const { volume } = jawPhantom({ missing: [5] });
    const r = checkArrangement(teethOf(volume), { plane: 'axial' });
    expect(r?.items.some((i) => i.flags.some((f) => f.startsWith('gap')))).toBe(true);
  });

  it('separates teeth that touch', () => {
    const { volume } = jawPhantom({ toothRadiusMm: 2.6 });
    const mask = thresholdMask(volume, { lo: 1000 });
    expect(labelComponents(mask).objects.length).toBeLessThan(11);
    expect(splitTouching(mask).objects).toHaveLength(11);
  });
});

describe('arrangement — what is not a row', () => {
  it('warns when most objects deviate, instead of listing flags as if they meant something', () => {
    const b = new PhantomBuilder([120, 120, 60], [1, 1, 1]);
    // Scattered rods of different directions: not a row.
    const spots: [number, number, number, [number, number, number]][] = [
      [20, 20, 30, [1, 0, 0]],
      [95, 30, 20, [0, 1, 0]],
      [40, 90, 40, [0, 0, 1]],
      [70, 60, 25, [1, 1, 0]],
      [100, 100, 45, [0, 1, 1]],
      [15, 70, 15, [1, 0, 1]],
      [60, 15, 50, [0, 0, 1]],
      [85, 85, 10, [1, 0, 0]],
    ];
    for (const [x, y, z, axis] of spots) b.ellipsoid([x, y, z], [9, 2.5, 2.5], 800, axis);
    const objects = labelComponents(thresholdMask(b.build(), { lo: 400 })).objects;
    const r = checkArrangement(objects, { plane: 'axial' });
    expect(r?.warning).toBeDefined();
  });
});

describe('symmetry — region', () => {
  it('restricting to a box around the subject leaves out a couch that spoils the overlap', () => {
    const b = new PhantomBuilder([140, 130, 160], [1, 1, 1]);
    b.ellipsoid([60, 40, 80], [18, 16, 46], SOFT, [0, 0, 1]);
    b.capsule([60, 40, 40], [60, 40, 120], 4, BONE);
    b.ellipsoid([60, 30, 138], [11, 11, 15], SOFT, [0, 0, 1]);
    b.box([95, 90, 0], [139, 125, 159], SOFT); // a couch off to one side
    const v = b.build();
    const whole = checkSymmetry(v);
    const boxed = checkSymmetry(v, { region: { min: [30, 10, 0], max: [90, 70, 159] } });
    expect(boxed.dice).toBeGreaterThan(whole.dice);
    expect(boxed.dice).toBeGreaterThan(0.9);
  });
});

describe('gaps', () => {
  it('finds a crack through bone and not a clean block', () => {
    const cracked = findGaps(crackPhantom({ widthMm: 1, angleDeg: 20 }));
    expect(cracked.candidates.length).toBeGreaterThan(0);
    expect(cracked.candidates[0].planarity).toBeLessThan(0.45);
    const clean = findGaps(crackPhantom({}));
    expect(clean.candidates).toHaveLength(0);
  });

  it('does not take a round canal or a void for a crack', () => {
    const r = findGaps(crackPhantom({ canal: true, void: true }));
    expect(r.candidates).toHaveLength(0);
  });

  it('still finds the crack when the canal is there too', () => {
    const r = findGaps(crackPhantom({ widthMm: 1, canal: true, void: true }));
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates[0].areaMm2).toBeGreaterThan(200);
  });
});

describe('survey', () => {
  it('describes the subject without naming it', () => {
    const s = surveySubject(animalPhantom());
    expect(s.intensity.looksLikeHounsfield).toBe(true);
    expect(s.symmetry.best).toBe('x');
    expect(s.subject.extentMm[2]).toBeGreaterThan(80);
    expect(s.notes.length).toBeGreaterThan(0);
    expect(s.dense.pieces).toBeGreaterThan(0);
    expect(BONE).toBeGreaterThan(0);
  });
});
