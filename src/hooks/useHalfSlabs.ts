import { slabHalfSlices } from '@/lib/volume/plane';
import { useVolumeStore } from '@/store';
import type { SlicePlane } from '@/types';
import { useMemo } from 'react';

/** Slab MIP half-thickness in slices, or 0 when slabbing is off or no volume is open. */
export function useHalfSlabs(plane: SlicePlane, slabMm: number): number {
  const spacing = useVolumeStore((s) => s.volume?.meta.spacing);
  return useMemo(
    () => (spacing ? slabHalfSlices(plane, slabMm, spacing) : 0),
    [slabMm, spacing, plane],
  );
}
