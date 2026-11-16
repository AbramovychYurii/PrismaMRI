import type { Vec3 } from '../types';
import { type Mask3, forEachLine } from './grid';

/**
 * Box-shaped dilation by `radius` voxels per axis, as three separable passes
 * with prefix sums — O(N) however large the radius. Outside the grid counts as
 * background.
 */
export function dilate(mask: Mask3, radius: Vec3): Mask3 {
  let src = mask.data;
  for (let axis = 0; axis < 3; axis++) {
    const r = radius[axis];
    if (r <= 0) continue;
    const from = src;
    const dst = new Uint8Array(from.length);
    const prefix = new Int32Array(mask.dims[axis] + 1);
    forEachLine(mask.dims, axis, (base, stride, n) => {
      for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + from[base + i * stride];
      for (let i = 0; i < n; i++) {
        const lo = i - r < 0 ? 0 : i - r;
        const hi = i + r + 1 > n ? n : i + r + 1;
        if (prefix[hi] - prefix[lo] > 0) dst[base + i * stride] = 1;
      }
    });
    src = dst;
  }
  return withData(mask, src === mask.data ? src.slice() : src);
}

/** Box erosion; outside the grid counts as foreground, so edges don't eat the object. */
export function erode(mask: Mask3, radius: Vec3): Mask3 {
  const inverted = invert(mask);
  const grown = dilate(inverted, radius);
  return invert(grown);
}

/** Fills gaps narrower than 2·radius+1 voxels between foreground. */
export function close(mask: Mask3, radius: Vec3): Mask3 {
  return erode(dilate(mask, radius), radius);
}

export function invert(mask: Mask3): Mask3 {
  const data = new Uint8Array(mask.data.length);
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    const v = mask.data[i] ? 0 : 1;
    data[i] = v;
    count += v;
  }
  return { ...mask, data, count };
}

function withData(mask: Mask3, data: Uint8Array): Mask3 {
  let count = 0;
  for (let i = 0; i < data.length; i++) count += data[i];
  return { ...mask, data, count };
}

/** The voxels of `mask` that are not set in `other`, a mask on the same grid. */
export function subtract(mask: Mask3, other: ArrayLike<number>): Mask3 {
  const data = new Uint8Array(mask.data.length);
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    if (mask.data[i] && !other[i]) {
      data[i] = 1;
      count++;
    }
  }
  return { ...mask, data, count };
}
