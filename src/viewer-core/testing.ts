/**
 * @prisma-mri/viewer-core/testing — synthetic volumes with known answers, for
 * tests and benchmarks of the analysis in `@prisma-mri/viewer-core/analysis`.
 *
 * Kept out of the analysis entry so an app's bundle never carries them. Young,
 * like the analysis API: it may change in any 0.x release.
 */
export {
  type AnimalOptions,
  type CrackOptions,
  type JawOptions,
  PhantomBuilder,
  animalPhantom,
  crackPhantom,
  jawPhantom,
} from './analysis/phantoms';
