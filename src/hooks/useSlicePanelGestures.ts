import { type SlicePanelCore, cursorFromClick } from '@/hooks/useSlicePanelCore';
import type { SlicePlane } from '@/types';
import { useCallback, useRef } from 'react';

/**
 * Pointer and touch gestures for a slice panel.
 *
 * Split out of the panel component because they are behaviour, not markup:
 * each one reads the core, decides what the interaction means, and pushes the
 * result to the store without rendering anything.
 */

/**
 * Moves the crosshair to the click position. The first click on an unfocused
 * panel only focuses it — rotating the 3-D model stays opt-in via the context
 * menu's "View from this side".
 */
export function useCrosshairClick(core: SlicePanelCore, plane: SlicePlane) {
  const { canvasRef, dims, cursor, drawFracs } = core.frame;
  const { isActive, setActivePlane, setCursor } = core;
  return useCallback(
    (e: React.MouseEvent) => {
      if (!isActive) {
        setActivePlane(plane);
        return;
      }
      if (!canvasRef.current || !dims || !cursor) return;
      setCursor(cursorFromClick(e, canvasRef.current, plane, dims, cursor, drawFracs));
    },
    [canvasRef, dims, cursor, drawFracs, isActive, setActivePlane, setCursor, plane],
  );
}

const DRAG_THRESHOLD_PX = 3;

interface DragState {
  pointerId: number | null;
  startX: number;
  startY: number;
  started: boolean;
}

const NO_DRAG: DragState = { pointerId: null, startX: 0, startY: 0, started: false };

/**
 * Shift+drag measurement. Nothing reaches the store until the pointer clears
 * {@link DRAG_THRESHOLD_PX}, so a bare Shift+click neither drops a zero-length
 * measurement nor wipes the existing one.
 */
export function useShiftDragMeasurement(core: SlicePanelCore, plane: SlicePlane) {
  const drag = useRef<DragState>(NO_DRAG);
  const { canvasRef, dims, cursor, drawFracs } = core.frame;
  const { isActive, setActivePlane, measure } = core;

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!e.shiftKey || e.button !== 0) return;
    if (!canvasRef.current || !dims || !cursor) return;
    e.preventDefault();
    if (!isActive) setActivePlane(plane);
    drag.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, started: false };
    // Capture so moves keep arriving once the pointer leaves the panel.
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const state = drag.current;
    if (state.pointerId !== e.pointerId || state.pointerId === null) return;
    if (!canvasRef.current) return;

    if (!state.started) {
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      // Anchor to where the press landed, not to the already-displaced pointer.
      measure.beginDrag(
        { clientX: state.startX, clientY: state.startY },
        canvasRef.current,
        drawFracs,
      );
      state.started = true;
    }
    measure.updateDrag(e, canvasRef.current, drawFracs);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (drag.current.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    drag.current = NO_DRAG;
  };

  return { onPointerDown, onPointerMove, onPointerUp };
}

/** Pixels of vertical swipe that traverse the plane's full slice range. */
const TOUCH_SWIPE_FULL_RANGE_PX = 300;

export function useSliceSwipe(core: SlicePanelCore, plane: SlicePlane) {
  const gesture = useRef<{ startY: number; startIdx: number } | null>(null);
  const { idx, total, onScrub } = core.slice;
  const { isActive, setActivePlane } = core;

  return {
    onTouchStart: (e: React.TouchEvent) => {
      if (!isActive) setActivePlane(plane);
      gesture.current = { startY: e.touches[0].clientY, startIdx: idx };
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (!gesture.current) return;
      const travelled = gesture.current.startY - e.touches[0].clientY;
      const step = Math.round((travelled / TOUCH_SWIPE_FULL_RANGE_PX) * total);
      if (step === 0) return;
      const nextIdx = Math.max(1, Math.min(total, gesture.current.startIdx + step));
      onScrub(nextIdx);
      gesture.current = { startY: e.touches[0].clientY, startIdx: nextIdx };
    },
    onTouchEnd: () => {
      gesture.current = null;
    },
  };
}
