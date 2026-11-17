/**
 * @prisma-mri/viewer-core/unstable — helpers the viewer packages share.
 *
 * No semver here: they exist because `viewer-react` and the host app need
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
export { clamp } from './volume/math';
