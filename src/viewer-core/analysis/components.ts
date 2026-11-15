import type { Vec3 } from '../types';
import { distanceTransform } from './distance';
import { type Mask3, maskToSource, round, roundTriple } from './grid';
import { eigenSym3 } from './linalg';

export interface ComponentObject {
  /** 1-based, by volume, largest first. */
  id: number;
  voxels: number;
  volumeMm3: number;
  /** Source voxel coordinates. */
  centroid: Vec3;
  centroidMm: Vec3;
  /** Inclusive box in source voxels. */
  bbox: { min: Vec3; max: Vec3 };
  extentMm: Vec3;
  /** Principal axes as unit vectors along (x, y, z), longest first. */
  axes: [Vec3, Vec3, Vec3];
  /** Standard deviation along each principal axis, mm, longest first. */
  spreadMm: Vec3;
  /** Approximate length along the principal axis, mm (exact for an ellipsoid). */
  lengthMm: number;
  /** spread₁ / spread₂ — 1 for a ball, large for a rod. */
  elongation: number;
  /** spread₂ / spread₃ — large for a sheet. */
  flatness: number;
}

export interface Labelling {
  /** 0 = background or dropped; otherwise the object id. */
  labels: Int32Array;
  mask: Mask3;
  objects: ComponentObject[];
  /** Components found before `minVoxels` and `maxObjects` filtering. */
  totalFound: number;
}

export interface LabelOptions {
  connectivity?: 6 | 26;
  /** Drop components smaller than this many mask voxels. */
  minVoxels?: number;
  maxObjects?: number;
}

/** Raster-order neighbours already visited when scanning forward. */
function backwardNeighbours(connectivity: 6 | 26): Vec3[] {
  const list: Vec3[] = [];
  for (let dz = -1; dz <= 0; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dz === 0 && (dy > 0 || (dy === 0 && dx >= 0))) continue;
        const manhattan = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
        if (connectivity === 6 && manhattan !== 1) continue;
        list.push([dx, dy, dz]);
      }
    }
  }
  return list;
}

/** Disjoint sets of the labels 1, 2, … handed out by `add`. */
class LabelSets {
  private parent = new Int32Array(1024);
  private next = 1;

  add(): number {
    if (this.next >= this.parent.length) {
      const grown = new Int32Array(this.parent.length * 2);
      grown.set(this.parent);
      this.parent = grown;
    }
    this.parent[this.next] = this.next;
    return this.next++;
  }

  /** The root of `label`'s set; shortens the path to it on the way. */
  find(label: number): number {
    const { parent } = this;
    let root = label;
    while (parent[root] !== root) root = parent[root];
    let cur = label;
    while (parent[cur] !== root) {
      const up = parent[cur];
      parent[cur] = root;
      cur = up;
    }
    return root;
  }

  /** Merges the set rooted at `root` into the one rooted at `into`. */
  join(root: number, into: number): void {
    this.parent[root] = into;
  }
}

/** Connected components by union-find over one raster scan. */
export function labelComponents(mask: Mask3, options: LabelOptions = {}): Labelling {
  const { connectivity = 26 } = options;
  const [w, h, d] = mask.dims;
  const N = w * h * d;
  const raw = new Int32Array(N);
  const sets = new LabelSets();
  const neighbours = backwardNeighbours(connectivity);

  for (let k = 0; k < d; k++) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const idx = i + j * w + k * w * h;
        if (!mask.data[idx]) continue;
        let label = 0;
        for (const [dx, dy, dz] of neighbours) {
          const x = i + dx;
          const y = j + dy;
          const z = k + dz;
          if (x < 0 || x >= w || y < 0 || y >= h || z < 0) continue;
          const l = raw[x + y * w + z * w * h];
          if (l === 0) continue;
          const root = sets.find(l);
          if (label === 0) label = root;
          else if (root < label) {
            sets.join(label, root);
            label = root;
          } else if (root > label) sets.join(root, label);
        }
        raw[idx] = label || sets.add();
      }
    }
  }
  for (let i = 0; i < N; i++) if (raw[i]) raw[i] = sets.find(raw[i]);
  return buildLabelling(mask, raw, options);
}

/**
 * Ranks raw labels by size, drops small ones and measures what is left. The
 * object ids are written over `raw`, which becomes the labelling's `labels`.
 */
function buildLabelling(mask: Mask3, raw: Int32Array, options: LabelOptions): Labelling {
  const { minVoxels = 1, maxObjects = 5000 } = options;
  let maxRaw = 0;
  for (let i = 0; i < raw.length; i++) if (raw[i] > maxRaw) maxRaw = raw[i];
  const sizes = new Int32Array(maxRaw + 1);
  for (let i = 0; i < raw.length; i++) if (raw[i]) sizes[raw[i]]++;

  const present: number[] = [];
  for (let l = 1; l <= maxRaw; l++) if (sizes[l] > 0) present.push(l);
  const totalFound = present.length;
  const kept = present
    .filter((l) => sizes[l] >= minVoxels)
    .sort((a, b) => sizes[b] - sizes[a])
    .slice(0, maxObjects);
  const idOf = new Int32Array(maxRaw + 1);
  kept.forEach((l, n) => {
    idOf[l] = n + 1;
  });

  const K = kept.length;
  // Per object: count, Σx, Σy, Σz, Σxx, Σxy, Σxz, Σyy, Σyz, Σzz (mm), then bbox (6, mask idx).
  const acc = new Float64Array(K * 10);
  const box = new Int32Array(K * 6);
  for (let n = 0; n < K; n++) {
    box[n * 6] = box[n * 6 + 1] = box[n * 6 + 2] = 2 ** 30;
    box[n * 6 + 3] = box[n * 6 + 4] = box[n * 6 + 5] = -1;
  }
  const [w, h, d] = mask.dims;
  const [sx, sy, sz] = mask.spacing;
  for (let k = 0; k < d; k++) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const idx = i + j * w + k * w * h;
        if (!raw[idx]) continue;
        const id = idOf[raw[idx]];
        raw[idx] = id;
        if (!id) continue;
        const n = id - 1;
        const x = i * sx;
        const y = j * sy;
        const z = k * sz;
        const a = n * 10;
        acc[a]++;
        acc[a + 1] += x;
        acc[a + 2] += y;
        acc[a + 3] += z;
        acc[a + 4] += x * x;
        acc[a + 5] += x * y;
        acc[a + 6] += x * z;
        acc[a + 7] += y * y;
        acc[a + 8] += y * z;
        acc[a + 9] += z * z;
        const b = n * 6;
        if (i < box[b]) box[b] = i;
        if (j < box[b + 1]) box[b + 1] = j;
        if (k < box[b + 2]) box[b + 2] = k;
        if (i > box[b + 3]) box[b + 3] = i;
        if (j > box[b + 4]) box[b + 4] = j;
        if (k > box[b + 5]) box[b + 5] = k;
      }
    }
  }

  const voxelMm3 = sx * sy * sz;
  const s = mask.stride;
  const objects: ComponentObject[] = [];
  for (let n = 0; n < K; n++) {
    const a = n * 10;
    const c = acc[a];
    const mx = acc[a + 1] / c;
    const my = acc[a + 2] / c;
    const mz = acc[a + 3] / c;
    const cov = [
      [acc[a + 4] / c - mx * mx, acc[a + 5] / c - mx * my, acc[a + 6] / c - mx * mz],
      [acc[a + 5] / c - mx * my, acc[a + 7] / c - my * my, acc[a + 8] / c - my * mz],
      [acc[a + 6] / c - mx * mz, acc[a + 8] / c - my * mz, acc[a + 9] / c - mz * mz],
    ];
    // A single voxel (or a flat run) has no spread; the block's own size is the floor.
    const floor = Math.min(sx, sy, sz) ** 2 / 12;
    const e = eigenSym3(cov);
    const spread: Vec3 = [
      Math.sqrt(Math.max(e.values[0], floor)),
      Math.sqrt(Math.max(e.values[1], floor)),
      Math.sqrt(Math.max(e.values[2], floor)),
    ];
    const b = n * 6;
    const lo = maskToSource(mask, [box[b], box[b + 1], box[b + 2]]);
    const hi = maskToSource(mask, [box[b + 3], box[b + 4], box[b + 5]]);
    const centre = maskToSource(mask, [mx / sx, my / sy, mz / sz]);
    objects.push({
      id: n + 1,
      voxels: c * s * s * s,
      volumeMm3: c * voxelMm3,
      centroid: centre,
      centroidMm: [(centre[0] * sx) / s, (centre[1] * sy) / s, (centre[2] * sz) / s],
      bbox: {
        min: [lo[0] - (s - 1) / 2, lo[1] - (s - 1) / 2, lo[2] - (s - 1) / 2],
        max: [hi[0] + (s - 1) / 2, hi[1] + (s - 1) / 2, hi[2] + (s - 1) / 2],
      },
      extentMm: [
        (box[b + 3] - box[b] + 1) * sx,
        (box[b + 4] - box[b + 1] + 1) * sy,
        (box[b + 5] - box[b + 2] + 1) * sz,
      ],
      axes: e.vectors,
      spreadMm: spread,
      lengthMm: 2 * Math.sqrt(5) * spread[0],
      elongation: spread[0] / spread[1],
      flatness: spread[1] / spread[2],
    });
  }
  return { labels: raw, mask, objects, totalFound };
}

export interface SplitOptions extends LabelOptions {
  /**
   * Split parts joined by a bridge narrower than this fraction of the smaller
   * part's own radius (default 0.7). Lower splits less.
   */
  neckRatio?: number;
}

/**
 * Splits objects that touch (teeth in contact, vertebrae on a disc). Works on
 * the thickness map: every thickness peak is a part, and two parts merge back
 * unless the bridge between them is clearly thinner than the thinner part —
 * a watershed with merging by relative saddle height. A heuristic: it finds
 * *necks*, so parts joined by a wide bridge stay joined.
 */
export function splitTouching(mask: Mask3, options: SplitOptions = {}): Labelling {
  const { neckRatio = 0.7, minVoxels = 1 } = options;
  const [w, h, d] = mask.dims;
  const N = w * h * d;
  const dist = distanceTransform(mask);

  // Voxels in order of decreasing thickness (bucket sort on a fine grid).
  const unit = Math.min(...mask.spacing) / 8;
  let maxKey = 0;
  for (let i = 0; i < N; i++) {
    if (mask.data[i]) maxKey = Math.max(maxKey, Math.min(2_000_000, Math.floor(dist[i] / unit)));
  }
  const buckets = new Int32Array(maxKey + 2);
  for (let i = 0; i < N; i++)
    if (mask.data[i]) buckets[Math.min(maxKey, Math.floor(dist[i] / unit)) + 1]++;
  for (let k = 1; k < buckets.length; k++) buckets[k] += buckets[k - 1];
  const sorted = new Int32Array(mask.count);
  const cursor = buckets.slice();
  for (let i = 0; i < N; i++) {
    if (mask.data[i]) sorted[cursor[Math.min(maxKey, Math.floor(dist[i] / unit))]++] = i;
  }

  const label = new Int32Array(N);
  const sets = new LabelSets();
  /** Thickness at the thickest voxel of each region, by region label. */
  let peak = new Float32Array(1024);
  const neighbours: Vec3[] = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz) neighbours.push([dx, dy, dz]);
    }
  }
  const roots: number[] = [];
  for (let s = sorted.length - 1; s >= 0; s--) {
    const idx = sorted[s];
    const i = idx % w;
    const j = Math.floor(idx / w) % h;
    const k = Math.floor(idx / (w * h));
    roots.length = 0;
    for (const [dx, dy, dz] of neighbours) {
      const x = i + dx;
      const y = j + dy;
      const z = k + dz;
      if (x < 0 || x >= w || y < 0 || y >= h || z < 0 || z >= d) continue;
      const l = label[x + y * w + z * w * h];
      if (!l) continue;
      const r = sets.find(l);
      if (!roots.includes(r)) roots.push(r);
    }
    const here = dist[idx];
    if (roots.length === 0) {
      const region = sets.add();
      if (region >= peak.length) {
        const grown = new Float32Array(peak.length * 2);
        grown.set(peak);
        peak = grown;
      }
      peak[region] = here;
      label[idx] = region;
      continue;
    }
    // The voxel belongs to the region with the tallest peak; the others merge
    // into it only if this saddle is nearly as thick as the thinner of the two.
    let top = roots[0];
    for (const r of roots) if (peak[r] > peak[top]) top = r;
    for (const r of roots) {
      if (r === top) continue;
      if (here >= neckRatio * Math.min(peak[r], peak[top])) sets.join(r, top);
    }
    label[idx] = sets.find(top);
  }
  for (let i = 0; i < N; i++) if (label[i]) label[i] = sets.find(label[i]);
  return buildLabelling(mask, label, { ...options, minVoxels });
}

/** Compact, JSON-ready description of an object. */
export function describeObject(o: ComponentObject) {
  return {
    id: o.id,
    volumeMm3: round(o.volumeMm3, 1),
    centroidVoxel: roundTriple(o.centroid, 1),
    bboxVoxel: { min: roundTriple(o.bbox.min, 0), max: roundTriple(o.bbox.max, 0) },
    extentMm: roundTriple(o.extentMm, 1),
    lengthMm: round(o.lengthMm, 1),
    elongation: round(o.elongation, 2),
    flatness: round(o.flatness, 2),
    longAxis: roundTriple(o.axes[0], 2),
  };
}
