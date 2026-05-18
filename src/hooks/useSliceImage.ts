import { extractSliceGrayImage } from '@/lib/volume/slices';
import { useVolumeStore } from '@/store/volumeStore';
import type { SliceImage, SlicePlane } from '@/types';
import { useMemo } from 'react';

function sliceIndexFor(plane: SlicePlane, cursor: { x: number; y: number; z: number }): number {
  if (plane === 'coronal') return cursor.y;
  if (plane === 'sagittal') return cursor.x;
  return cursor.z;
}

/** Memoized 2D slice image for a plane at the current cursor + committed W/L. */
export function useSliceImage(plane: SlicePlane): SliceImage | null {
  const volume = useVolumeStore((s) => s.volume);
  const cursor = useVolumeStore((s) => s.cursor);
  const wl = useVolumeStore((s) => s.wl);

  return useMemo(() => {
    if (!volume || !cursor) return null;
    const index = sliceIndexFor(plane, cursor);
    return extractSliceGrayImage(volume, plane, index, wl);
  }, [volume, cursor, wl, plane]);
}
