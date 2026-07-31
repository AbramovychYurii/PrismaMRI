import { sliceIndex } from '@/lib/volume/plane';
import { extractSliceGrayImage } from '@/lib/volume/slices';
import { useVolumeStore } from '@/store/volumeStore';
import type { SliceImage, SlicePlane } from '@/types';
import { useMemo } from 'react';

/** Memoized 2D slice image for a plane at the current cursor + committed W/L. */
export function useSliceImage(plane: SlicePlane, halfSlabs = 0): SliceImage | null {
  const volume = useVolumeStore((s) => s.volume);
  const cursor = useVolumeStore((s) => s.cursor);
  const wl = useVolumeStore((s) => s.wl);

  return useMemo(() => {
    if (!volume || !cursor) return null;
    return extractSliceGrayImage(volume, plane, sliceIndex(cursor, plane), wl, halfSlabs);
  }, [volume, cursor, wl, plane, halfSlabs]);
}
