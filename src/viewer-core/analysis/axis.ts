import type { Vec3 } from '../types';
import type { Labelling } from './components';
import { maskToSource, round, roundTriple, sourceToMask } from './grid';
import { angleBetweenDeg, dot } from './linalg';

export interface AxisProfile {
  id: number;
  lengthMm: number;
  /** Straight-line distance between the two ends ÷ length along the path (1 = straight). */
  straightness: number;
  maxBend: { angleDeg: number; atMm: number; centroidVoxel: Vec3 } | null;
  /** Equivalent diameter per segment, mm, from one end to the other. */
  diameterMm: number[];
  narrowest: { diameterMm: number; atMm: number };
  widest: { diameterMm: number; atMm: number };
  /** Centre of each segment, source voxels. */
  path: Vec3[];
}

/**
 * Follows an elongated object along its long axis: centre line, length,
 * thickness per segment and the sharpest bend. The bend is the angle between
 * the centre line a little before a point and a little after it, so a
 * fracture's angulation or a limb's kink stands out from gentle curvature.
 */
export function axisProfile(labelling: Labelling, id: number, segments = 24): AxisProfile | null {
  const object = labelling.objects.find((o) => o.id === id);
  if (!object) return null;
  const { mask, labels } = labelling;
  const [w, h] = mask.dims;
  const [sx, sy, sz] = mask.spacing;
  const axis = object.axes[0];
  const c0 = sourceToMask(mask, object.centroid);
  const origin: Vec3 = [c0[0] * sx, c0[1] * sy, c0[2] * sz];

  let tMin = Number.POSITIVE_INFINITY;
  let tMax = Number.NEGATIVE_INFINITY;
  const lo = sourceToMask(mask, object.bbox.min).map((v) => Math.max(0, Math.floor(v) - 1));
  const hi = sourceToMask(mask, object.bbox.max).map((v, a) =>
    Math.min(mask.dims[a] - 1, Math.ceil(v) + 1),
  );
  const project = (i: number, j: number, k: number) =>
    dot([i * sx - origin[0], j * sy - origin[1], k * sz - origin[2]], axis);
  for (let k = lo[2]; k <= hi[2]; k++) {
    for (let j = lo[1]; j <= hi[1]; j++) {
      for (let i = lo[0]; i <= hi[0]; i++) {
        if (labels[i + j * w + k * w * h] !== id) continue;
        const t = project(i, j, k);
        if (t < tMin) tMin = t;
        if (t > tMax) tMax = t;
      }
    }
  }
  if (!(tMax > tMin)) return null;
  const n = Math.max(4, segments);
  const span = tMax - tMin;
  const segLen = span / n;
  const count = new Float64Array(n);
  const sum = new Float64Array(n * 3);
  for (let k = lo[2]; k <= hi[2]; k++) {
    for (let j = lo[1]; j <= hi[1]; j++) {
      for (let i = lo[0]; i <= hi[0]; i++) {
        if (labels[i + j * w + k * w * h] !== id) continue;
        const s = Math.min(n - 1, Math.floor((project(i, j, k) - tMin) / segLen));
        count[s]++;
        sum[s * 3] += i * sx;
        sum[s * 3 + 1] += j * sy;
        sum[s * 3 + 2] += k * sz;
      }
    }
  }
  const voxelMm3 = sx * sy * sz;
  const path: Vec3[] = [];
  const centres: Vec3[] = [];
  const diameter: number[] = [];
  const atMm: number[] = [];
  for (let s = 0; s < n; s++) {
    if (count[s] < 3) continue;
    const c: Vec3 = [sum[s * 3] / count[s], sum[s * 3 + 1] / count[s], sum[s * 3 + 2] / count[s]];
    centres.push(c);
    atMm.push((s + 0.5) * segLen);
    // Cross-section area = volume of the segment ÷ its length.
    diameter.push(2 * Math.sqrt((count[s] * voxelMm3) / segLen / Math.PI));
    path.push(maskToSource(mask, [c[0] / sx, c[1] / sy, c[2] / sz]));
  }
  if (centres.length < 4) return null;

  let pathLength = 0;
  for (let i = 1; i < centres.length; i++) {
    pathLength += Math.hypot(
      centres[i][0] - centres[i - 1][0],
      centres[i][1] - centres[i - 1][1],
      centres[i][2] - centres[i - 1][2],
    );
  }
  const chord = Math.hypot(
    centres[centres.length - 1][0] - centres[0][0],
    centres[centres.length - 1][1] - centres[0][1],
    centres[centres.length - 1][2] - centres[0][2],
  );

  // Bend at segment i: the centre line over the k segments before vs the k after.
  const k = Math.max(2, Math.round(centres.length / 8));
  let maxBend: AxisProfile['maxBend'] = null;
  for (let i = k; i < centres.length - k; i++) {
    const before: Vec3 = [
      centres[i][0] - centres[i - k][0],
      centres[i][1] - centres[i - k][1],
      centres[i][2] - centres[i - k][2],
    ];
    const after: Vec3 = [
      centres[i + k][0] - centres[i][0],
      centres[i + k][1] - centres[i][1],
      centres[i + k][2] - centres[i][2],
    ];
    const angle = angleBetweenDeg(before, after);
    if (!maxBend || angle > maxBend.angleDeg) {
      maxBend = {
        angleDeg: round(angle, 1),
        atMm: round(atMm[i], 1),
        centroidVoxel: roundTriple(path[i], 1),
      };
    }
  }
  const diam = diameter.map((v) => round(v, 1));
  const iMin = diameter.indexOf(Math.min(...diameter));
  const iMax = diameter.indexOf(Math.max(...diameter));
  return {
    id,
    lengthMm: round(span, 1),
    straightness: round(chord / pathLength, 3),
    maxBend,
    diameterMm: diam,
    narrowest: { diameterMm: diam[iMin], atMm: round(atMm[iMin], 1) },
    widest: { diameterMm: diam[iMax], atMm: round(atMm[iMax], 1) },
    path: path.map((p) => roundTriple(p, 1)),
  };
}
