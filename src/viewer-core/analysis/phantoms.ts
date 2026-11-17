import type { LoadedVolume, Vec3 } from '../types';
import { cross } from '../volume/orientation';
import { dot } from './linalg';

/**
 * Synthetic volumes with defects whose answer is known exactly: a tooth off
 * its arch and leaning 50°, a limb that is missing or bent, a hairline crack
 * through a block of bone. They test and benchmark the analysis before it is
 * trusted on a real scan.
 */

/** Small deterministic random source, so a noisy phantom is the same every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const AIR = -1000;
export const SOFT = 40;
export const BONE = 1200;
export const TOOTH = 1800;

const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};

/** Two unit vectors perpendicular to `u` (and to each other). */
function frame(u: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const v = unit(cross(u, helper));
  return [v, unit(cross(u, v))];
}

export class PhantomBuilder {
  readonly data: Float32Array;
  constructor(
    readonly dims: Vec3,
    readonly spacing: Vec3,
    background = AIR,
  ) {
    this.data = new Float32Array(dims[0] * dims[1] * dims[2]).fill(background);
  }

  /** Voxel coordinates of a point given in mm from the volume's corner. */
  mm(x: number, y: number, z: number): Vec3 {
    return [x / this.spacing[0], y / this.spacing[1], z / this.spacing[2]];
  }

  /** Ellipsoid centred at `c` (mm), semi-axes (a along `axis`, b and c across) in mm. */
  ellipsoid(c: Vec3, radii: Vec3, value: number, axis: Vec3 = [0, 0, 1]): this {
    const u = unit(axis);
    const [v, w] = frame(u);
    const reach = Math.max(...radii);
    this.each(
      c,
      [reach, reach, reach],
      (p) => {
        const d: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
        const q =
          (dot(d, u) / radii[0]) ** 2 + (dot(d, v) / radii[1]) ** 2 + (dot(d, w) / radii[2]) ** 2;
        return q <= 1;
      },
      value,
    );
    return this;
  }

  /** Round-ended rod from `a` to `b` (mm) with the given radius. */
  capsule(a: Vec3, b: Vec3, radius: number, value: number): this {
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len2 = dot(ab, ab) || 1;
    const centre: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const reach = Math.sqrt(len2) / 2 + radius;
    this.each(
      centre,
      [reach, reach, reach],
      (p) => {
        const ap: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
        const t = Math.min(1, Math.max(0, dot(ap, ab) / len2));
        const d = Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
        return d <= radius;
      },
      value,
    );
    return this;
  }

  /** Axis-aligned box (mm). */
  box(min: Vec3, max: Vec3, value: number): this {
    const centre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    this.each(
      centre,
      [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2],
      () => true,
      value,
    );
    return this;
  }

  /**
   * Sets `value` on a slab of the given thickness whose normal is `normal`,
   * through `point`, but only where the voxel currently holds `onlyWhere`.
   */
  slab(
    point: Vec3,
    normal: Vec3,
    thicknessMm: number,
    value: number,
    onlyWhere: (v: number) => boolean,
  ): this {
    const n = unit(normal);
    const [sx, sy, sz] = this.spacing;
    const [w, h, d] = this.dims;
    for (let k = 0; k < d; k++) {
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const p: Vec3 = [i * sx, j * sy, k * sz];
          const dist = dot([p[0] - point[0], p[1] - point[1], p[2] - point[2]], n);
          const idx = i + j * w + k * w * h;
          if (Math.abs(dist) <= thicknessMm / 2 && onlyWhere(this.data[idx]))
            this.data[idx] = value;
        }
      }
    }
    return this;
  }

  noise(sd: number, seed = 1): this {
    if (sd <= 0) return this;
    const rand = mulberry32(seed);
    for (let i = 0; i < this.data.length; i++) {
      // Box–Muller.
      const u = Math.max(1e-12, rand());
      const v = rand();
      this.data[i] += sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    return this;
  }

  private each(centre: Vec3, reach: Vec3, inside: (p: Vec3) => boolean, value: number): void {
    const [sx, sy, sz] = this.spacing;
    const [w, h] = this.dims;
    const lo = [0, 1, 2].map((a) =>
      Math.max(0, Math.floor((centre[a] - reach[a]) / this.spacing[a]) - 1),
    );
    const hi = [0, 1, 2].map((a) =>
      Math.min(this.dims[a] - 1, Math.ceil((centre[a] + reach[a]) / this.spacing[a]) + 1),
    );
    for (let k = lo[2]; k <= hi[2]; k++) {
      for (let j = lo[1]; j <= hi[1]; j++) {
        for (let i = lo[0]; i <= hi[0]; i++) {
          if (inside([i * sx, j * sy, k * sz])) this.data[i + j * w + k * w * h] = value;
        }
      }
    }
  }

  build(modality = 'CT'): LoadedVolume {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const v of this.data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return {
      voxels: this.data,
      meta: {
        dims: this.dims,
        spacing: this.spacing,
        origin: [0, 0, 0],
        bitsAllocated: 16,
        modality,
      },
      scalarMin: min,
      scalarMax: max,
      windowLevel: { window: max - min, level: (max + min) / 2 },
      formatId: 'nrrd',
    };
  }
}

export interface JawOptions {
  /** Index (0-based, left to right) of the tooth to displace. */
  ectopic?: { index: number; offCurveMm: number; tiltDeg: number; raiseMm?: number };
  /** Indices of teeth to leave out. */
  missing?: number[];
  /** Tooth half-width, mm. 1.8 leaves a gap; 2.4 makes neighbours touch. */
  toothRadiusMm?: number;
  noiseSd?: number;
  seed?: number;
}

/** Eleven teeth along a parabolic arch, in soft tissue; crowns point along +z. */
export function jawPhantom(options: JawOptions = {}): { volume: LoadedVolume; teeth: Vec3[] } {
  const { toothRadiusMm = 1.8 } = options;
  const b = new PhantomBuilder([170, 150, 90], [0.5, 0.5, 0.5]);
  b.ellipsoid([42.5, 40, 22], [40, 33, 18], SOFT, [0, 0, 1]);
  const n = 11;
  const teeth: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const x = 42.5 + (i - (n - 1) / 2) * 4.5;
    const y = 52 - (x - 42.5) ** 2 / 38;
    teeth.push([x, y, 22]);
  }
  teeth.forEach((c, i) => {
    if (options.missing?.includes(i)) return;
    const e = options.ectopic?.index === i ? options.ectopic : undefined;
    let centre: Vec3 = c;
    let axis: Vec3 = [0, 0, 1];
    if (e) {
      centre = [c[0], c[1] - e.offCurveMm, c[2] + (e.raiseMm ?? 0)];
      const t = (e.tiltDeg * Math.PI) / 180;
      axis = [0, Math.sin(t), Math.cos(t)];
    }
    b.ellipsoid(centre, [4.5, toothRadiusMm, toothRadiusMm], TOOTH, axis);
  });
  b.noise(options.noiseSd ?? 0, options.seed ?? 1);
  return { volume: b.build(), teeth };
}

export type Limb = 'frontLeft' | 'frontRight' | 'hindLeft' | 'hindRight';

export interface AnimalOptions {
  missing?: Limb[];
  /** Bend the bone of the hind-right limb by this many degrees half way down. */
  bendHindRightDeg?: number;
  /** Shorten the hind-right limb by this fraction (0–1). */
  shortenHindRight?: number;
  /** Add a swelling (soft-tissue ball) on the hind-left limb, radius mm. */
  swellingMm?: number;
  noiseSd?: number;
  seed?: number;
}

/**
 * A four-legged body, mirror-symmetric about x = 60 mm: trunk along z with a
 * bone core, and a limb at each corner reaching down (+y) with its own bone.
 */
export function animalPhantom(options: AnimalOptions = {}): LoadedVolume {
  const b = new PhantomBuilder([120, 130, 160], [1, 1, 1]);
  b.ellipsoid([60, 40, 80], [18, 16, 46], SOFT, [0, 0, 1]);
  b.capsule([60, 40, 40], [60, 40, 120], 4, BONE);
  // A head at one end, so the body is not also mirror-symmetric front to back.
  b.ellipsoid([60, 30, 138], [11, 11, 15], SOFT, [0, 0, 1]);
  b.ellipsoid([60, 30, 140], [8, 8, 11], BONE, [0, 0, 1]);
  const spots: Record<Limb, [number, number]> = {
    frontLeft: [60 + 20, 48],
    frontRight: [60 - 20, 48],
    hindLeft: [60 + 20, 112],
    hindRight: [60 - 20, 112],
  };
  for (const [name, [x, z]] of Object.entries(spots) as [Limb, [number, number]][]) {
    if (options.missing?.includes(name)) continue;
    let length = 58;
    if (name === 'hindRight' && options.shortenHindRight) length *= 1 - options.shortenHindRight;
    const top: Vec3 = [x, 44, z];
    b.capsule(top, [x, 44 + length, z], 7, SOFT);
    if (name === 'hindRight' && options.bendHindRightDeg) {
      const mid: Vec3 = [x, 44 + length / 2, z];
      const t = (options.bendHindRightDeg * Math.PI) / 180;
      const end: Vec3 = [x, mid[1] + (length / 2) * Math.cos(t), z + (length / 2) * Math.sin(t)];
      b.capsule(top, mid, 3, BONE);
      b.capsule(mid, end, 3, BONE);
    } else {
      b.capsule(top, [x, 44 + length - 2, z], 3, BONE);
    }
    if (name === 'hindLeft' && options.swellingMm) {
      b.ellipsoid(
        [x + 8, 44 + length * 0.55, z],
        [options.swellingMm, options.swellingMm, options.swellingMm],
        SOFT,
      );
    }
  }
  b.noise(options.noiseSd ?? 0, options.seed ?? 1);
  return b.build();
}

export interface CrackOptions {
  /** Crack thickness, mm; omit for an intact block. */
  widthMm?: number;
  /** Rotation of the crack plane's normal away from x, in the x–y plane. */
  angleDeg?: number;
  /** A round canal along z through the block (a normal structure that mimics nothing flat). */
  canal?: boolean;
  /** A spherical void. */
  void?: boolean;
  noiseSd?: number;
  seed?: number;
}

/** A 30×20×30 mm block of bone in soft tissue, optionally cracked right through. */
export function crackPhantom(options: CrackOptions = {}): LoadedVolume {
  const b = new PhantomBuilder([140, 100, 100], [0.5, 0.5, 0.5]);
  b.ellipsoid([35, 25, 25], [34, 24, 24], SOFT);
  b.box([10, 10, 10], [40, 30, 40], BONE);
  if (options.canal) b.capsule([18, 20, 6], [18, 20, 44], 1.2, SOFT);
  if (options.void) b.ellipsoid([32, 22, 18], [2.5, 2.5, 2.5], SOFT);
  if (options.widthMm) {
    const t = ((options.angleDeg ?? 0) * Math.PI) / 180;
    b.slab([25, 20, 25], [Math.cos(t), Math.sin(t), 0], options.widthMm, SOFT, (v) => v === BONE);
  }
  b.noise(options.noiseSd ?? 0, options.seed ?? 1);
  return b.build();
}
