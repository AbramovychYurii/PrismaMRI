import type { SlicePlane, Vec3 } from '../types';
import type { ComponentObject } from './components';
import { round, roundTriple } from './grid';
import { axisAngleDeg, median } from './linalg';

/** Which centroid coordinates span the plane the row lies in, and which one stacks. */
const PLANE_AXES: Record<SlicePlane, { u: 0 | 1 | 2; v: 0 | 1 | 2; w: 0 | 1 | 2 }> = {
  axial: { u: 0, v: 1, w: 2 },
  coronal: { u: 0, v: 2, w: 1 },
  sagittal: { u: 1, v: 2, w: 0 },
};

export interface ArrangementItem {
  id: number;
  centroidVoxel: Vec3;
  /** Distance from the fitted curve, in the plane, mm. */
  offCurveMm: number;
  /** Distance from the row's usual level along the stacking axis, mm. */
  offLevelMm: number;
  /** Angle between this object's long axis and its neighbours', degrees; null for round objects. */
  tiltDeg: number | null;
  /** Distance to the next object along the row, mm. */
  gapToNextMm: number | null;
  flags: string[];
}

export interface ArrangementReport {
  plane: SlicePlane;
  count: number;
  curve: { a: number; b: number; c: number };
  medianTiltDeg: number | null;
  medianSpacingMm: number | null;
  /** Set when so many objects deviate that the selection is probably not one regular row. */
  warning?: string;
  items: ArrangementItem[];
}

export interface ArrangementOptions {
  plane?: SlicePlane;
  /** Report as off the curve beyond this, mm (also needs 3 robust SDs). */
  minOffsetMm?: number;
  /** Report a tilt at least this many degrees above the row's median. */
  minTiltExcessDeg?: number;
  /** Report a gap this many times the median spacing. */
  gapFactor?: number;
}

/** Least-squares v = a·u² + b·u + c with Tukey re-weighting, so outliers don't bend it. */
function robustQuadratic(u: number[], v: number[]): { a: number; b: number; c: number } {
  let weights = u.map(() => 1);
  let coef = { a: 0, b: 0, c: median(v) || 0 };
  for (let iter = 0; iter < 8; iter++) {
    // Normal equations for [u², u, 1].
    const M = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const r = [0, 0, 0];
    u.forEach((ui, i) => {
      const row = [ui * ui, ui, 1];
      for (let p = 0; p < 3; p++) {
        r[p] += weights[i] * row[p] * v[i];
        for (let q = 0; q < 3; q++) M[p][q] += weights[i] * row[p] * row[q];
      }
    });
    const sol = solve3(M, r);
    if (!sol) break;
    coef = { a: sol[0], b: sol[1], c: sol[2] };
    const res = u.map((ui, i) => v[i] - (coef.a * ui * ui + coef.b * ui + coef.c));
    const scale = 1.4826 * median(res.map(Math.abs)) || 1e-6;
    weights = res.map((e) => {
      const t = e / (4.685 * Math.max(scale, 0.25));
      return Math.abs(t) < 1 ? (1 - t * t) ** 2 : 0;
    });
  }
  return coef;
}

function solve3(M: number[][], r: number[]): number[] | null {
  const a = M.map((row, i) => [...row, r[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let i = col + 1; i < 3; i++) if (Math.abs(a[i][col]) > Math.abs(a[pivot][col])) pivot = i;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let i = 0; i < 3; i++) {
      if (i === col) continue;
      const f = a[i][col] / a[col][col];
      for (let j = col; j < 4; j++) a[i][j] -= f * a[col][j];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

/**
 * Compares objects that should form a regular row — teeth along an arch,
 * vertebrae along a spine, ribs — with the row itself: how far each sits from
 * the curve through the rest, from their usual level, how much it leans against
 * its neighbours, and where the spacing opens up. Density is not used at all.
 */
export function checkArrangement(
  objects: ComponentObject[],
  options: ArrangementOptions = {},
): ArrangementReport | null {
  const { plane = 'axial', minOffsetMm = 3, minTiltExcessDeg = 20, gapFactor = 1.6 } = options;
  if (objects.length < 5) return null;
  const { u: iu, v: iv, w: iw } = PLANE_AXES[plane];
  const U = objects.map((o) => o.centroidMm[iu]);
  const V = objects.map((o) => o.centroidMm[iv]);
  const W = objects.map((o) => o.centroidMm[iw]);
  const curve = robustQuadratic(U, V);
  const levelMedian = median(W);
  const offCurve = objects.map((_, i) => {
    const f = curve.a * U[i] * U[i] + curve.b * U[i] + curve.c;
    const slope = 2 * curve.a * U[i] + curve.b;
    return (V[i] - f) / Math.sqrt(1 + slope * slope);
  });
  const offLevel = W.map((x) => x - levelMedian);
  const sigmaCurve = 1.4826 * median(offCurve.map(Math.abs)) || 0.5;
  const sigmaLevel = 1.4826 * median(offLevel.map(Math.abs)) || 0.5;

  // Order along the row for neighbours and spacing: by position along the curve's long extent.
  const order = objects.map((_, i) => i).sort((p, q) => U[p] - U[q]);
  const rank = new Map(order.map((i, r) => [i, r]));
  const roundish = (o: ComponentObject) => o.elongation < 1.3;

  const tilts: (number | null)[] = objects.map((o, i) => {
    if (roundish(o)) return null;
    const r = rank.get(i) as number;
    const near = [order[r - 1], order[r + 1]].filter(
      (j): j is number => j !== undefined && !roundish(objects[j]),
    );
    if (near.length === 0) return null;
    // The *least* angle to either neighbour: a tilted tooth leans against both,
    // while its neighbours are only tilted against that one.
    return Math.min(...near.map((j) => axisAngleDeg(o.axes[0], objects[j].axes[0])));
  });
  const medianTilt = median(tilts.filter((t): t is number => t !== null));

  const gaps: (number | null)[] = objects.map((_, i) => {
    const r = rank.get(i) as number;
    const next = order[r + 1];
    if (next === undefined) return null;
    return Math.hypot(U[next] - U[i], V[next] - V[i], W[next] - W[i]);
  });
  const medianGapAll = median(gaps.filter((g): g is number => g !== null));
  // A gap is judged against the gaps around it, not the row's median: a row
  // curves, so spacing along it is not uniform.
  const localGap = (i: number): number | null => {
    const r = rank.get(i) as number;
    const around: number[] = [];
    for (const off of [-2, -1, 1, 2]) {
      const j = order[r + off];
      if (j === undefined) continue;
      const g = gaps[j];
      if (g !== null) around.push(g);
    }
    return around.length >= 2 ? median(around) : null;
  };

  const items: ArrangementItem[] = objects.map((o, i) => {
    const flags: string[] = [];
    if (Math.abs(offCurve[i]) >= Math.max(minOffsetMm, 3 * sigmaCurve)) {
      flags.push(`off the row's curve by ${round(Math.abs(offCurve[i]), 1)} mm`);
    }
    if (Math.abs(offLevel[i]) >= Math.max(minOffsetMm, 3 * sigmaLevel)) {
      flags.push(
        `${round(Math.abs(offLevel[i]), 1)} mm ${offLevel[i] > 0 ? 'above' : 'below'} the row's level`,
      );
    }
    const tilt = tilts[i];
    if (tilt !== null && tilt - (medianTilt || 0) >= minTiltExcessDeg) {
      flags.push(
        `leans ${round(tilt, 0)}° against its neighbours (row median ${round(medianTilt || 0, 0)}°)`,
      );
    }
    const gap = gaps[i];
    const expected = localGap(i);
    if (gap !== null && expected !== null && gap >= gapFactor * expected) {
      flags.push(
        `gap of ${round(gap, 1)} mm to the next object (its neighbours ${round(expected, 1)} mm)`,
      );
    }
    return {
      id: o.id,
      centroidVoxel: roundTriple(o.centroid, 1),
      offCurveMm: round(offCurve[i], 1),
      offLevelMm: round(offLevel[i], 1),
      tiltDeg: tilt === null ? null : round(tilt, 0),
      gapToNextMm: gap === null ? null : round(gap, 1),
      flags,
    };
  });
  const flagged = items.filter((i) => i.flags.length > 0).length;
  const scattered = medianGapAll > 0 && sigmaCurve > 0.5 * medianGapAll;
  const warning =
    flagged >= 3 && flagged / items.length > 0.25
      ? `${flagged} of ${items.length} objects are flagged — far too many for one regular row. The selection probably mixes bone and teeth, or splits and merges objects. Do not read the flags one by one: look at the objects (capture_montage, find_objects list), pick the ones that really form the row and pass them as object_ids.`
      : scattered
        ? `The objects do not lie along one curve (typical distance from the fitted curve ${round(sigmaCurve, 1)} mm against ${round(medianGapAll, 1)} mm between neighbours), so "off the curve" and "leans" have no reference. They are probably not one row — select the row by looking, or choose another plane.`
        : undefined;
  return {
    plane,
    count: objects.length,
    curve: { a: round(curve.a, 5), b: round(curve.b, 4), c: round(curve.c, 2) },
    medianTiltDeg: Number.isNaN(medianTilt) ? null : round(medianTilt, 0),
    medianSpacingMm: Number.isNaN(medianGapAll) ? null : round(medianGapAll, 1),
    warning,
    items: items.sort((p, q) => q.flags.length - p.flags.length || p.id - q.id),
  };
}
