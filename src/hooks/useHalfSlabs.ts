import { useVolumeStore } from '@/store';
import type { SlicePlane } from '@/types';
import { useMemo } from 'react';

/**
 * Converts a Slab MIP thickness in millimetres to a half-slab slice count
 * for the given plane, based on the loaded volume's voxel spacing.
 *
 * Returns 0 when slabMm is 0 or no volume is loaded.
 */
export function useHalfSlabs(plane: SlicePlane, slabMm: number): number {
  const spacing = useVolumeStore((s) => s.volume?.meta.spacing);
  return useMemo(() => {
    if (!spacing || slabMm === 0) return 0;
    const mmPerSlice =
      plane === 'axial' ? spacing[2] : plane === 'coronal' ? spacing[1] : spacing[0];
    return Math.max(1, Math.round(slabMm / 2 / mmPerSlice));
  }, [slabMm, spacing, plane]);
}
