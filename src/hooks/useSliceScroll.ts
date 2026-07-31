import { clamp } from '@/lib/volume/math';
import { sliceAxis, sliceCount } from '@/lib/volume/plane';
import { useVolumeStore } from '@/store/volumeStore';
import type { SlicePlane } from '@/types';
import { useCallback, useEffect, useRef } from 'react';

/** Moves the cursor `steps` slices along `plane`. Returns false when no volume is open. */
function stepSlice(plane: SlicePlane, steps: number): boolean {
  const { volume, cursor, setCursor } = useVolumeStore.getState();
  if (!volume || !cursor) return false;
  const axis = sliceAxis(plane);
  const next = clamp(cursor[axis] + steps, 0, sliceCount(volume.meta.dims, plane) - 1);
  if (next === cursor[axis]) return true;
  setCursor({ ...cursor, [axis]: next });
  return true;
}

/** Pixels of wheel delta per slice — roughly one mouse-wheel notch. */
const WHEEL_PX_PER_STEP = 28;

/** Caps the work a fast flick or high-DPI wheel can queue into a single frame. */
const MAX_STEPS_PER_FRAME = 3;

const DELTA_MODE_SCALE = [1, 16, 100];

/**
 * Wheel handler for slice navigation. Trackpads emit ~120 events/s, far more
 * than three canvases can repaint, so deltas accumulate and flush at most once
 * per frame. The remainder is carried over, letting slow scrolls cross the
 * threshold exactly once instead of ping-ponging.
 */
export function useSliceScroll(plane: SlicePlane) {
  const accumulated = useRef(0);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      rafId.current = null;
      accumulated.current = 0;
    };
  }, []);

  return useCallback(
    (e: React.WheelEvent) => {
      accumulated.current += e.deltaY * (DELTA_MODE_SCALE[e.deltaMode] ?? 1);
      if (rafId.current !== null) return;

      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        const delta = accumulated.current;
        const wholeSteps = Math.trunc(delta / WHEEL_PX_PER_STEP);
        if (wholeSteps === 0) return;

        const steps = clamp(wholeSteps, -MAX_STEPS_PER_FRAME, MAX_STEPS_PER_FRAME);
        accumulated.current = delta - steps * WHEEL_PX_PER_STEP;
        if (!stepSlice(plane, steps)) accumulated.current = 0;
      });
    },
    [plane],
  );
}

const PLANE_FOCUS_KEYS: Record<string, SlicePlane> = {
  '1': 'coronal',
  '2': 'sagittal',
  '3': 'axial',
};

/**
 * 1 / 2 / 3 focus the coronal / sagittal / axial plane — the same focus that
 * arrow stepping and the crosshair act on. Modifier combos and text fields are
 * left alone.
 */
export function usePlaneFocusKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const plane = PLANE_FOCUS_KEYS[e.key];
      if (!plane) return;
      const { volume, setActivePlane } = useVolumeStore.getState();
      if (!volume) return;
      e.preventDefault();
      setActivePlane(plane);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Global ↑/↓ stepping of the active plane by ±1 slice. */
export function useActivePlaneKeys(): void {
  const activePlane = useVolumeStore((s) => s.activePlane);

  useEffect(() => {
    if (!activePlane) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const { volume, cursor } = useVolumeStore.getState();
      if (!volume || !cursor) return;
      e.preventDefault();
      stepSlice(activePlane, e.key === 'ArrowUp' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePlane]);
}
