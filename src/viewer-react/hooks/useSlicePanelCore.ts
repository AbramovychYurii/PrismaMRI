import {
  type LetterboxRect,
  type SlicePlane,
  type Vec3,
  type VolumeCursor,
  fracToVoxel,
  imageToPanel,
  letterboxRect,
  planeAspect,
  pointerToImageFrac,
  sliceAxis,
  sliceCount,
  sliceNumber,
  voxelToFrac,
} from '@prisma-mri/viewer-core';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ACCENT_VAR, AXIS_ACCENT, type Axis } from '../constants';
import { accentAlpha, useViewerStore, useViewerSurfaces, useViewerTheme } from '../viewer';
import { useMeasurementInteraction } from './useMeasurementInteraction';
import { useCanvasPainter, useCanvasSize } from './useSliceCanvas';
import { useSliceImage } from './useSliceImage';
import { useSliceScroll } from './useSliceScroll';

export const axisColor = (axis: Axis) => ACCENT_VAR[AXIS_ACCENT[axis]];
export const axisGlow = (axis: Axis) => accentAlpha(AXIS_ACCENT[axis], 0.45);

/** Where a click lands in voxel space, keeping the plane's own slice index. */
export function cursorFromClick(
  event: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  plane: SlicePlane,
  dims: Vec3,
  cursor: VolumeCursor,
  rect: LetterboxRect | null,
): VolumeCursor {
  const { fx, fy } = pointerToImageFrac(event, canvas, rect);
  return fracToVoxel(plane, fx, fy, cursor, dims);
}

/**
 * Shared state and behaviour of a slice panel — canvas painting, scrubbing,
 * crosshair and measurement — so the rail panel and the fullscreen portal stay
 * in lockstep.
 *
 * `halfSlabs` > 0 renders a Slab MIP of that many slices on each side.
 */
export function useSlicePanelCore(plane: SlicePlane, halfSlabs = 0) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasSize = useCanvasSize(canvasRef);

  const activePlane = useViewerStore((s) => s.activePlane);
  const setActivePlane = useViewerStore((s) => s.setActivePlane);
  const setCursor = useViewerStore((s) => s.setCursor);
  const requestSnapToView = useViewerStore((s) => s.requestSnapToView);
  const dims = useViewerStore((s) => s.volume?.meta.dims);
  const spacing = useViewerStore((s) => s.volume?.meta.spacing);
  const cursor = useViewerStore((s) => s.cursor);
  const scrubVisible = useViewerStore((s) => s.scrubVisible[plane]);
  const setScrubVisible = useViewerStore((s) => s.setScrubVisible);
  const surfaces = useViewerSurfaces();
  const theme = useViewerTheme();

  const drawFracs = useMemo<LetterboxRect | null>(
    () =>
      dims && spacing
        ? letterboxRect(planeAspect(plane, dims, spacing), canvasSize.w, canvasSize.h)
        : null,
    [plane, dims, spacing, canvasSize],
  );

  const measureInteraction = useMeasurementInteraction(plane, dims, cursor);
  const image = useSliceImage(plane, halfSlabs);
  const onWheel = useSliceScroll(plane);

  useCanvasPainter(canvasRef, image, drawFracs, canvasSize, theme.canvasBackground);

  // Published so useMcpBridge can capture this plane. It lives here rather
  // than in the panel because the core owns the canvas, and exactly one core
  // exists per plane — so an agent capture always gets the canvas the user is
  // actually looking at, rail or fullscreen.
  useEffect(() => {
    surfaces.setCanvas(plane, canvasRef.current);
    return () => surfaces.setCanvas(plane, null);
  }, [plane, surfaces]);

  const cross = useMemo(() => {
    if (!dims || !cursor) return null;
    const { fx, fy } = voxelToFrac(plane, cursor, dims);
    return drawFracs ? imageToPanel(fx, fy, drawFracs) : { fx, fy };
  }, [plane, dims, cursor, drawFracs]);

  const adjustedDots = useMemo(
    () =>
      drawFracs
        ? measureInteraction.measureDots.map((d) => imageToPanel(d.fx, d.fy, drawFracs))
        : measureInteraction.measureDots,
    [measureInteraction.measureDots, drawFracs],
  );

  const handleScrub = useCallback(
    (nextSlice: number) => {
      if (!cursor) return;
      setCursor({ ...cursor, [sliceAxis(plane)]: nextSlice - 1 });
    },
    [cursor, plane, setCursor],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (canvasRef.current) measureInteraction.openMenu(e, canvasRef.current, drawFracs);
    },
    [measureInteraction.openMenu, drawFracs],
  );

  const onSnapToView = useCallback(() => requestSnapToView(plane), [requestSnapToView, plane]);

  const { idx, total } =
    dims && cursor
      ? { idx: sliceNumber(cursor, plane), total: sliceCount(dims, plane) }
      : { idx: 0, total: 0 };

  return {
    /**
     * The canvas and everything needed to convert a pointer position into a
     * voxel. Travels as a unit — no caller needs one of these without the rest.
     */
    frame: { canvasRef, drawFracs, dims, cursor },
    /** Where we are in the stack, plus every control that moves us. */
    slice: { idx, total, scrubVisible, setScrubVisible, onScrub: handleScrub, onWheel },
    /** Measurement state, its context menu and the shift-drag handlers. */
    measure: {
      enabled: measureInteraction.enabled,
      measurement: measureInteraction.measurement,
      dots: adjustedDots,
      menu: measureInteraction.menu,
      closeMenu: measureInteraction.closeMenu,
      onContextMenu: handleContextMenu,
      openMenuAtCursor: measureInteraction.openMenuAtCursor,
      onMeasureFrom: measureInteraction.onMeasureFrom,
      onMeasureTo: measureInteraction.onMeasureTo,
      onClear: measureInteraction.onClear,
      beginDrag: measureInteraction.beginDrag,
      updateDrag: measureInteraction.updateDrag,
    },
    /** Crosshair position in panel space, or null before a volume is open. */
    cross,
    isActive: activePlane === plane,
    setCursor,
    setActivePlane,
    onSnapToView,
  };
}

export type SlicePanelCore = ReturnType<typeof useSlicePanelCore>;
