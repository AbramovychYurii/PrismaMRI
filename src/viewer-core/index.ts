/** @prisma-mri/viewer-core — volume import, slices and the 3-D preview, without React. */
export { describeLoadError } from './import/load-error';
export { loadVolumeFromSource } from './import/load-volume';
export {
  collectFilesFromEntry,
  fromDirectoryHandle,
  fromFileList,
  type FsEntry,
} from './import/scan-folder';
export { seriesLabel } from './import/series';
export type { ImportHints, ImportSource, SeriesChoice } from './import/types';
export { type LoadResult, loadVolumeInWorker, type LoadWorkerResult } from './import/volume-client';
export type * from './types';
export { MAX_3D_TEXTURE_EDGE, prepareVolumeFor3D } from './volume/preview-3d';
export {
  alongAxis,
  clampToDims,
  fracToVoxel,
  isSlicePlane,
  PLANE_GEOMETRY,
  planeAspect,
  type ScreenDirection,
  slabHalfSlices,
  sliceAxis,
  sliceCount,
  sliceIndex,
  sliceNumber,
  stepInPlane,
  volumeCenter,
  voxelToFrac,
} from './volume/plane';
export { extractSliceGrayImage } from './volume/slices';
export { ThreePreview, type ThreePreviewOptions } from './volume/three-preview';
export { intensityUnit } from './volume/units';
export { deriveVolumeId } from './volume/volumeId';
