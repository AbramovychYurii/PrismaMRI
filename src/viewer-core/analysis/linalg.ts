import type { Vec3 } from '../types';

export interface Eigen3 {
  /** Descending. */
  values: Vec3;
  /** Unit vectors, in the same order as `values`. */
  vectors: [Vec3, Vec3, Vec3];
}

/** Eigen-decomposition of a symmetric 3×3 matrix (cyclic Jacobi). */
export function eigenSym3(m: number[][]): Eigen3 {
  const a = m.map((row) => row.slice());
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 32; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-14 * (Math.abs(a[0][0]) + Math.abs(a[1][1]) + Math.abs(a[2][2]) + 1e-300)) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p];
        const akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k];
        const aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p];
        const vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  const vec = (i: number): Vec3 => [v[0][i], v[1][i], v[2][i]];
  return {
    values: [a[order[0]][order[0]], a[order[1]][order[1]], a[order[2]][order[2]]],
    vectors: [vec(order[0]), vec(order[1]), vec(order[2])],
  };
}

export const dot = (a: ArrayLike<number>, b: ArrayLike<number>): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const norm = (a: ArrayLike<number>): number => Math.hypot(a[0], a[1], a[2]);

export function angleBetweenDeg(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const d = dot(a, b) / (norm(a) * norm(b) || 1);
  return (Math.acos(Math.min(1, Math.max(-1, d))) * 180) / Math.PI;
}

/** Angle between two *axes* (direction-less lines): 0–90°. */
export function axisAngleDeg(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const angle = angleBetweenDeg(a, b);
  return angle > 90 ? 180 - angle : angle;
}

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const s = values.slice().sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
