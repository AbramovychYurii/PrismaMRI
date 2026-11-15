import type { Axis, LoadedVolume, Vec3 } from '../types';
import { type ComponentObject, labelComponents } from './components';
import { round, roundTriple, thresholdMask } from './grid';
import { intensityHistogram, percentileOf } from './histogram';
import { checkSymmetry } from './symmetry';
import { autoClasses } from './thresholds';

export interface SubjectSurvey {
  grid: { dims: Vec3; spacingMm: Vec3; fovMm: Vec3 };
  /** As the file declares them — may be absent, and never assumed. */
  declared: {
    modality?: string;
    bodyPart?: string;
    species?: string;
    studyDescription?: string;
    protocol?: string;
    scanner?: string;
  };
  intensity: {
    min: number;
    max: number;
    /** 1st, 25th, 50th, 75th, 99th percentile of all voxels. */
    percentiles: [number, number, number, number, number];
    /** Otsu: air | tissue. */
    subjectThreshold: number;
    /** Otsu: soft | dense (bone, teeth, contrast, metal). */
    denseThreshold: number;
    /** True when the range looks like Hounsfield units (air near −1000). */
    looksLikeHounsfield: boolean;
  };
  subject: {
    volumeMl: number;
    fractionOfFov: number;
    extentMm: Vec3;
    bboxVoxel: { min: Vec3; max: Vec3 };
    /** Principal axes of the subject (unit vectors along x, y, z), longest first. */
    axes: [Vec3, Vec3, Vec3];
    /** Standard deviation along each, mm. */
    spreadMm: Vec3;
    /** Long ÷ middle spread: ≈ 1 compact, ≫ 1 elongated (limb, trunk, whole body). */
    elongation: number;
    /** Middle ÷ short spread: ≫ 1 flat. */
    flatness: number;
    /** Separate pieces ≥ 1 % of the subject (table, a second animal, loose parts). */
    pieces: { volumeMl: number; extentMm: Vec3 }[];
  };
  dense: { fractionOfSubject: number; pieces: number };
  symmetry: { best: Axis; dice: number; perAxis: Record<Axis, number> };
  /** Plain statements of what the numbers show, for the first look. */
  notes: string[];
}

type SubjectShape = Pick<
  SubjectSurvey['subject'],
  'extentMm' | 'bboxVoxel' | 'axes' | 'spreadMm' | 'elongation' | 'flatness'
>;

/** Shape of the largest piece; a featureless point when the volume holds nothing. */
function describeShape(main: ComponentObject | undefined): SubjectShape {
  if (!main) {
    return {
      extentMm: [0, 0, 0],
      bboxVoxel: { min: [0, 0, 0], max: [0, 0, 0] },
      axes: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      spreadMm: [0, 0, 0],
      elongation: 1,
      flatness: 1,
    };
  }
  return {
    extentMm: roundTriple(main.extentMm, 0),
    bboxVoxel: { min: roundTriple(main.bbox.min, 0), max: roundTriple(main.bbox.max, 0) },
    axes: [
      roundTriple(main.axes[0], 2),
      roundTriple(main.axes[1], 2),
      roundTriple(main.axes[2], 2),
    ],
    spreadMm: roundTriple(main.spreadMm, 1),
    elongation: round(main.elongation, 2),
    flatness: round(main.flatness, 2),
  };
}

/**
 * A first look at what is in the volume — size, shape, how much is dense,
 * whether it is mirror-symmetric — without deciding what it *is*. Whether it is
 * a head, a paw or a whole animal is for the reader to say from the declared
 * fields, the images and what the user tells them.
 */
export function surveySubject(volume: LoadedVolume): SubjectSurvey {
  const { meta } = volume;
  const { dims, spacing } = meta;
  const hist = intensityHistogram(volume);
  const [subjectThreshold, denseThreshold] = autoClasses(volume);

  const mask = thresholdMask(volume, { lo: subjectThreshold, maxVoxels: 2_000_000 });
  const pieces = labelComponents(mask, { minVoxels: 4 });
  const voxelMl = (mask.spacing[0] * mask.spacing[1] * mask.spacing[2]) / 1000;
  const totalMl = mask.count * voxelMl;
  const main = pieces.objects[0];
  const fovMm: Vec3 = [dims[0] * spacing[0], dims[1] * spacing[1], dims[2] * spacing[2]];

  const dense = thresholdMask(volume, { lo: denseThreshold, maxVoxels: 2_000_000 });
  const densePieces = labelComponents(dense, { minVoxels: 4 });

  const sym = checkSymmetry(volume, { threshold: subjectThreshold });
  const looksLikeHounsfield = volume.scalarMin <= -500 && volume.scalarMax >= 100;

  const notes: string[] = [];
  if (main) {
    const long = Math.max(...main.extentMm);
    const longAxis = 'xyz'[main.extentMm.indexOf(long)];
    notes.push(
      `Largest piece is ${Math.round(long)} mm along ${longAxis} and ${Math.round(Math.min(...main.extentMm))} mm at its narrowest (elongation ${round(main.elongation, 1)}).`,
    );
    const fov = main.extentMm.map((e, i) => e / fovMm[i]);
    if (Math.max(...fov) > 0.97)
      notes.push('The subject touches the edge of the field of view — it may be cropped.');
  }
  if (pieces.objects.length > 1) {
    const second = pieces.objects[1].volumeMm3 / pieces.objects[0].volumeMm3;
    if (second > 0.05) {
      notes.push(
        `There is a second large piece (${round(second * 100, 0)} % of the first): a table, a second subject, or a detached part.`,
      );
    }
  }
  notes.push(
    sym.dice >= 0.85
      ? `The subject is close to mirror-symmetric about ${sym.best} (overlap ${round(sym.dice, 2)}).`
      : `No strong mirror symmetry (best overlap ${round(sym.dice, 2)} about ${sym.best}) — either asymmetric anatomy, a one-sided structure or an off-centre view.`,
  );
  if (!looksLikeHounsfield) {
    notes.push(
      'Values do not look like Hounsfield units: use relative comparisons, not absolute thresholds.',
    );
  }
  if (volume.scalarMax >= 3000 && looksLikeHounsfield) {
    notes.push(
      'Very high values are present — dense material such as metal, which causes streak artefacts.',
    );
  }

  return {
    grid: {
      dims: [dims[0], dims[1], dims[2]],
      spacingMm: roundTriple(spacing, 3),
      fovMm: roundTriple(fovMm, 0),
    },
    declared: {
      modality: meta.modality,
      bodyPart: meta.bodyPart,
      species: meta.species,
      studyDescription: meta.studyDescription,
      protocol: meta.protocol,
      scanner: meta.scanner,
    },
    intensity: {
      min: round(volume.scalarMin, 1),
      max: round(volume.scalarMax, 1),
      percentiles: [0.01, 0.25, 0.5, 0.75, 0.99].map((p) => round(percentileOf(hist, p), 1)) as [
        number,
        number,
        number,
        number,
        number,
      ],
      subjectThreshold: round(subjectThreshold, 1),
      denseThreshold: round(denseThreshold, 1),
      looksLikeHounsfield,
    },
    subject: {
      volumeMl: round(totalMl, 1),
      fractionOfFov: round((mask.count * voxelMl * 1000) / (fovMm[0] * fovMm[1] * fovMm[2]), 3),
      ...describeShape(main),
      pieces: pieces.objects
        .filter((o) => o.volumeMm3 >= 0.01 * (main?.volumeMm3 ?? 0))
        .slice(0, 5)
        .map((o) => ({
          volumeMl: round(o.volumeMm3 / 1000, 1),
          extentMm: roundTriple(o.extentMm, 0),
        })),
    },
    dense: {
      fractionOfSubject: totalMl > 0 ? round((dense.count * voxelMl) / totalMl, 3) : 0,
      pieces: densePieces.objects.length,
    },
    symmetry: {
      best: sym.best,
      dice: sym.dice,
      perAxis: { x: sym.axes.x.dice, y: sym.axes.y.dice, z: sym.axes.z.dice },
    },
    notes,
  };
}
