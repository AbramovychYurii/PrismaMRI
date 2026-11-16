/**
 * @prisma-mri/viewer-core/unstable — helpers the viewer packages share.
 *
 * No semver here: they exist because `viewer-react` and the PrismaMRI app need
 * them, not because they are part of the library's promise. They may be renamed,
 * moved or removed in any release.
 */
export { fetchBlobWithProgress } from './util/fetch-with-progress';
export {
  imageToPanel,
  type LetterboxRect,
  letterboxRect,
  pointerToImageFrac,
} from './volume/letterbox';
export { round } from './analysis/grid';
export { seriesLabel } from './import/series';
export { clamp } from './volume/math';
export { alongAxis } from './volume/plane';
// Synthetic volumes with known defects — for tests and for the benchmark in research/.
export {
  type AnimalOptions,
  type CrackOptions,
  type JawOptions,
  PhantomBuilder,
  animalPhantom,
  crackPhantom,
  jawPhantom,
} from './analysis/phantoms';
