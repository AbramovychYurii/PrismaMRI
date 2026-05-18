import { clamp } from '@/lib/volume/math';
import { useVolumeStore } from '@/store/volumeStore';
import type { SlicePlane } from '@/types';
import { useCallback, useEffect } from 'react';

function axisFor(plane: SlicePlane): 'x' | 'y' | 'z' {
  return plane === 'coronal' ? 'y' : plane === 'sagittal' ? 'x' : 'z';
}

function maxIndexFor(plane: SlicePlane, dims: readonly [number, number, number]): number {
  return plane === 'coronal' ? dims[1] - 1 : plane === 'sagittal' ? dims[0] - 1 : dims[2] - 1;
}

/** Returns a wheel handler for a plane, and installs ↑/↓ arrow stepping. */
export function useSliceScroll(plane: SlicePlane) {
  const step = useCallback(
    (delta: number) => {
      const { volume, cursor, setCursor } = useVolumeStore.getState();
      if (!volume || !cursor) return;
      const axis = axisFor(plane);
      const max = maxIndexFor(plane, volume.meta.dims);
      const next = clamp(cursor[axis] + delta, 0, max);
      if (next !== cursor[axis]) setCursor({ ...cursor, [axis]: next });
    },
    [plane],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      step(e.deltaY > 0 ? 1 : -1);
    },
    [step],
  );

  return onWheel;
}

/** Global ↑/↓ stepping of the active plane by ±1 slice. */
export function useActivePlaneKeys(): void {
  const activePlane = useVolumeStore((s) => s.activePlane);

  useEffect(() => {
    if (!activePlane) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const { volume, cursor, setCursor } = useVolumeStore.getState();
      if (!volume || !cursor) return;
      e.preventDefault();
      const axis = axisFor(activePlane);
      const max = maxIndexFor(activePlane, volume.meta.dims);
      const delta = e.key === 'ArrowUp' ? 1 : -1;
      const next = clamp(cursor[axis] + delta, 0, max);
      if (next !== cursor[axis]) setCursor({ ...cursor, [axis]: next });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePlane]);
}
