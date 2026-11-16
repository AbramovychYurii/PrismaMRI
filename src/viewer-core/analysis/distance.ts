import { type Mask3, forEachLine } from './grid';

const FAR = 1e12;

/** Squared distance to the nearest sample of a 1-D function (Felzenszwalb–Huttenlocher). */
function pass(
  f: Float64Array,
  n: number,
  step: number,
  out: Float64Array,
  v: Int32Array,
  z: Float64Array,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = Number.NEGATIVE_INFINITY;
  z[1] = Number.POSITIVE_INFINITY;
  for (let q = 1; q < n; q++) {
    let s: number;
    for (;;) {
      const p = v[k];
      s = (f[q] + (q * step) ** 2 - (f[p] + (p * step) ** 2)) / (2 * step * (q - p));
      if (s <= z[k] && k > 0) k--;
      else break;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Number.POSITIVE_INFINITY;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q * step) k++;
    out[q] = (q * step - v[k] * step) ** 2 + f[v[k]];
  }
}

/**
 * Euclidean distance, in mm, from every foreground voxel to the nearest
 * background voxel — the thickness map. Separable and exact for anisotropic
 * voxels. Background voxels are 0.
 */
export function distanceTransform(mask: Mask3): Float32Array {
  const [w, h, d] = mask.dims;
  const total = w * h * d;
  const field = new Float32Array(total);
  for (let i = 0; i < total; i++) field[i] = mask.data[i] ? FAR : 0;
  const longest = Math.max(w, h, d);
  const line = new Float64Array(longest);
  const out = new Float64Array(longest);
  const v = new Int32Array(longest);
  const z = new Float64Array(longest + 1);
  for (let axis = 0; axis < 3; axis++) {
    forEachLine(mask.dims, axis, (base, stride, n) => {
      for (let i = 0; i < n; i++) line[i] = field[base + i * stride];
      pass(line, n, mask.spacing[axis], out, v, z);
      for (let i = 0; i < n; i++) field[base + i * stride] = out[i];
    });
  }
  for (let i = 0; i < total; i++) field[i] = Math.sqrt(field[i]);
  return field;
}
