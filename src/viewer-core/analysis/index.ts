/**
 * @prisma-mri/viewer-core/analysis — pure functions over a loaded volume: threshold masks,
 * connected components, gaps, symmetry, arrangement, profiles and ROI statistics.
 *
 * A separate entry so the main one stays about loading and slicing. The API is young and
 * may change in any 0.x release; it moves into the main entry once it settles.
 */
export {
  type ArrangementItem,
  type ArrangementOptions,
  type ArrangementReport,
  checkArrangement,
} from './arrangement';
export { type AxisProfile, axisProfile } from './axis';
export {
  type ComponentObject,
  type LabelOptions,
  type Labelling,
  type SplitOptions,
  describeObject,
  labelComponents,
  splitTouching,
} from './components';
export { type GapCandidate, type GapOptions, type GapReport, findGaps } from './gaps';
export { type Mask3, type Region, type ThresholdOptions, round, thresholdMask } from './grid';
export {
  type CurveMetric,
  type LineProfile,
  type RoiShape,
  type RoiStats,
  type SliceCurve,
  lineProfile,
  roiStats,
  roundLineProfile,
  roundRoi,
  sliceCurve,
} from './measure';
export { type SubjectSurvey, surveySubject } from './survey';
export {
  type SymmetryReport,
  type UnmatchedPart,
  checkSymmetry,
} from './symmetry';
export { autoClasses } from './thresholds';
// Synthetic volumes to test these against: `@prisma-mri/viewer-core/testing`.
