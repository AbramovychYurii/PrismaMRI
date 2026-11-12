import {
  type SliceImage,
  type SlicePlane,
  extractSliceGrayImage,
  sliceIndex,
} from '@prisma-mri/viewer-core';
import { useMemo } from 'react';
import { useViewerStore } from '../viewer';

/** Memoized 2D slice image for a plane at the current cursor + committed W/L. */
export function useSliceImage(plane: SlicePlane, halfSlabs = 0): SliceImage | null {
  const volume = useViewerStore((s) => s.volume);
  const cursor = useViewerStore((s) => s.cursor);
  const wl = useViewerStore((s) => s.wl);

  return useMemo(() => {
    if (!volume || !cursor) return null;
    return extractSliceGrayImage(volume, plane, sliceIndex(cursor, plane), wl, halfSlabs);
  }, [volume, cursor, wl, plane, halfSlabs]);
}
