import { slabHalfSlices } from '@/lib/volume/plane';
import type { SlicePlane } from '@/types';
import { useViewerStore } from '@/viewer';
import { useMemo } from 'react';

/** Slab MIP half-thickness in slices, or 0 when slabbing is off or no volume is open. */
export function useHalfSlabs(plane: SlicePlane, slabMm: number): number {
  const spacing = useViewerStore((s) => s.volume?.meta.spacing);
  return useMemo(
    () => (spacing ? slabHalfSlices(plane, slabMm, spacing) : 0),
    [slabMm, spacing, plane],
  );
}
