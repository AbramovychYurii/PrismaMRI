import { clamp } from '@/lib/volume/math';
import { useVolumeStore } from '@/store/volumeStore';
import type { SlicePlane } from '@/types';
import { useCallback, useEffect, useRef } from 'react';

function axisFor(plane: SlicePlane): 'x' | 'y' | 'z' {
  return plane === 'coronal' ? 'y' : plane === 'sagittal' ? 'x' : 'z';
}

function maxIndexFor(plane: SlicePlane, dims: readonly [number, number, number]): number {
  return plane === 'coronal' ? dims[1] - 1 : plane === 'sagittal' ? dims[0] - 1 : dims[2] - 1;
}

/** Pixels of wheel delta required to advance one slice. Trackpads emit small
 *  fractional deltas at high frequency; ~28 px ≈ one mouse-wheel notch. */
const WHEEL_PX_PER_STEP = 28;

/** Max slices advanced per animation frame — caps work when a fast flick or a
 *  high-DPI mouse wheel produces a huge delta in one go. */
const MAX_STEPS_PER_FRAME = 3;

/**
 * Returns a React `onWheel` handler for slice navigation.
 *
 * Wheel events arrive ~120/s on a trackpad — far faster than we can re-render
 * three slice canvases (especially with Slab MIP). We accumulate `deltaY` and
 * flush at most once per animation frame, advancing whole slices only. The
 * residual delta is kept so slow trackpad scrolls eventually cross the
 * threshold and step exactly once, instead of ping-ponging.
 *
 * No `preventDefault` — the app layout is `overflow: hidden`, so page scroll
 * isn't a concern and avoiding it dodges React's passive-listener warning.
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
      // Normalise line/page modes to pixels so the threshold makes sense.
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      accumulated.current += e.deltaY * scale;

      if (rafId.current !== null) return;
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        const delta = accumulated.current;
        // Only step when we have at least one full slice's worth of delta —
        // avoids the slow-scroll ping-pong that happens when we consume more
        // than we received.
        const rawStep = Math.trunc(delta / WHEEL_PX_PER_STEP);
        if (rawStep === 0) return;
        const step = Math.max(-MAX_STEPS_PER_FRAME, Math.min(MAX_STEPS_PER_FRAME, rawStep));
        accumulated.current = delta - step * WHEEL_PX_PER_STEP;

        const { volume, cursor, setCursor } = useVolumeStore.getState();
        if (!volume || !cursor) {
          accumulated.current = 0;
          return;
        }
        const axis = axisFor(plane);
        const max = maxIndexFor(plane, volume.meta.dims);
        const next = clamp(cursor[axis] + step, 0, max);
        if (next !== cursor[axis]) setCursor({ ...cursor, [axis]: next });
      });
    },
    [plane],
  );
}

/** Number keys → which plane they focus.  Order matches the panel stack
 *  (coronal / sagittal / axial, top to bottom). */
const PLANE_FOCUS_KEYS: Record<string, SlicePlane> = {
  '1': 'coronal',
  '2': 'sagittal',
  '3': 'axial',
};

/**
 * Global 1 / 2 / 3 keys: focus the coronal / sagittal / axial plane.
 * Focusing a plane is what arrow stepping and the crosshair act on, so this is
 * a fast keyboard alternative to clicking a panel.  Modifier combos (⌘1 etc.,
 * which switch browser tabs) and typing in inputs are ignored.
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
