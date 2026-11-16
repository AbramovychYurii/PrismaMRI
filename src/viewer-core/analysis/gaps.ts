import type { LoadedVolume, Vec3 } from '../types';
import { labelComponents } from './components';
import { boxSmooth, estimateNoiseSd } from './denoise';
import {
  type Mask3,
  type Region,
  clampRegion,
  fullRegion,
  round,
  roundTriple,
  thresholdMask,
} from './grid';
import { close, subtract } from './morphology';
import { autoClasses } from './thresholds';

export interface GapCandidate {
  id: number;
  centroidVoxel: Vec3;
  /** Width of the gap across its plane, mm. */
  thicknessMm: number;
  /** Area of the gap surface, mm². */
  areaMm2: number;
  /** thickness-direction spread ÷ in-plane spread: ≈ 0 for a flat sheet, ≈ 1 for a tube or ball. */
  planarity: number;
  /** Fraction of the gap that has dense material on both faces. */
  enclosure: number;
  normal: Vec3;
  /** Longest in-plane dimension, mm. */
  lengthMm: number;
}

export interface GapReport {
  threshold: number;
  maxGapMm: number;
  resolutionVoxels: number;
  /** Whether the volume was smoothed first (loses the thinnest gaps). */
  smoothed: boolean;
  /** Closing residue pieces before filtering. */
  rawPieces: number;
  candidates: GapCandidate[];
}

export interface GapOptions {
  /** Dense-material threshold (default: Otsu's upper threshold). */
  threshold?: number;
  /** Widest gap to look for, mm. */
  maxGapMm?: number;
  /** Smallest gap surface to report, mm². */
  minAreaMm2?: number;
  /** Largest `planarity` accepted. */
  maxPlanarity?: number;
  /** Smallest `enclosure` accepted. */
  minEnclosure?: number;
  region?: Region;
  /** Smooth before thresholding: default on when the noise is loud next to the contrast. */
  smooth?: boolean;
  maxResults?: number;
  maxVoxels?: number;
}

/** The dense-material mask of a region, thresholded from a smoothed copy when asked. */
function denseMask(
  volume: LoadedVolume,
  region: Region,
  lo: number,
  smooth: boolean,
  maxVoxels?: number,
): Mask3 {
  if (!smooth) return thresholdMask(volume, { lo, region, maxVoxels });
  // The smoothed copy holds the region alone, so its mask is told where that began.
  const mask = thresholdMask(boxSmooth(volume, region), { lo, maxVoxels });
  return { ...mask, offset: [region.min[0], region.min[1], region.min[2]] };
}

/**
 * Finds thin sheet-like gaps inside dense material — candidate cracks and
 * fracture lines. Closes the dense mask (which fills any gap narrower than
 * `maxGapMm`), takes what closing added, and keeps the pieces that are flat and
 * have dense material on both faces. Joint spaces, sutures, the periodontal
 * ligament space and thin canals look the same to it: a candidate is a place to
 * look, never a finding.
 */
export function findGaps(volume: LoadedVolume, options: GapOptions = {}): GapReport {
  const {
    maxGapMm = 2,
    minAreaMm2 = 15,
    maxPlanarity = 0.45,
    minEnclosure = 0.5,
    maxResults = 15,
  } = options;
  const [softThreshold, denseThreshold] = autoClasses(volume);
  const threshold = options.threshold ?? denseThreshold;
  // Noise makes holes in dense material and flecks in the gap; smooth first when
  // it is loud next to the contrast between soft tissue and dense material.
  const contrast = Math.max(1, threshold - softThreshold);
  const smooth = options.smooth ?? estimateNoiseSd(volume) > 0.08 * contrast;
  const region = clampRegion(options.region ?? fullRegion(volume.meta.dims), volume.meta.dims);
  const dense = denseMask(volume, region, threshold, smooth, options.maxVoxels);
  const radius = dense.spacing.map((s) => Math.max(1, Math.ceil(maxGapMm / 2 / s))) as Vec3;

  const residue = subtract(close(dense, radius), dense.data);
  const pieces = labelComponents(residue, { minVoxels: 6, maxObjects: 400 });
  const [sx, sy, sz] = dense.spacing;
  const probe = Math.min(sx, sy, sz);
  const [w, h, d] = dense.dims;
  const isDense = (mm: Vec3): boolean => {
    const i = Math.round(mm[0] / sx);
    const j = Math.round(mm[1] / sy);
    const k = Math.round(mm[2] / sz);
    if (i < 0 || j < 0 || k < 0 || i >= w || j >= h || k >= d) return false;
    return dense.data[i + j * w + k * w * h] === 1;
  };

  // Voxels of each piece, gathered once, for the enclosure probe.
  const members: number[][] = pieces.objects.map(() => []);
  const stepSample = Math.max(1, Math.floor(residue.count / (pieces.objects.length * 200 + 1)));
  for (let i = 0; i < pieces.labels.length; i++) {
    const id = pieces.labels[i];
    // A hash, not `i % step`: a regular stride can step over a crack aligned with the grid.
    if (id && (Math.imul(i, 2654435761) >>> 0) % stepSample === 0 && members[id - 1].length < 300) {
      members[id - 1].push(i);
    }
  }

  const candidates: Omit<GapCandidate, 'id'>[] = [];
  for (const o of pieces.objects) {
    const flat = o.spreadMm[2] / o.spreadMm[1];
    const thickness = Math.max(Math.sqrt(12) * o.spreadMm[2], probe);
    const area = o.volumeMm3 / thickness;
    if (flat > maxPlanarity || area < minAreaMm2 || thickness > maxGapMm * 1.5) continue;
    const n = o.axes[2];
    const reach = thickness / 2 + 1.5 * probe;
    let both = 0;
    const sample = members[o.id - 1];
    for (const idx of sample) {
      const i = idx % w;
      const j = Math.floor(idx / w) % h;
      const k = Math.floor(idx / (w * h));
      const p: Vec3 = [i * sx, j * sy, k * sz];
      const a: Vec3 = [p[0] + n[0] * reach, p[1] + n[1] * reach, p[2] + n[2] * reach];
      const b: Vec3 = [p[0] - n[0] * reach, p[1] - n[1] * reach, p[2] - n[2] * reach];
      if (isDense(a) && isDense(b)) both++;
    }
    const enclosure = sample.length ? both / sample.length : 0;
    if (enclosure < minEnclosure) continue;
    candidates.push({
      centroidVoxel: roundTriple(o.centroid, 1),
      thicknessMm: round(thickness, 2),
      areaMm2: round(area, 0),
      planarity: round(flat, 2),
      enclosure: round(enclosure, 2),
      normal: roundTriple(n, 2),
      lengthMm: round(2 * Math.sqrt(5) * o.spreadMm[0], 1),
    });
  }
  candidates.sort((p, q) => q.areaMm2 * q.enclosure - p.areaMm2 * p.enclosure);
  return {
    threshold: round(threshold, 1),
    maxGapMm,
    resolutionVoxels: dense.stride,
    smoothed: smooth,
    rawPieces: pieces.totalFound,
    candidates: candidates.slice(0, maxResults).map((c, i) => ({ id: i + 1, ...c })),
  };
}
