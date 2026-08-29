import { ACCENT_VAR, AXIS_ACCENT, type Axis, CANVAS_BG, accentRgba } from '@/constants';
import { useMeasurementInteraction } from '@/hooks/useMeasurementInteraction';
import { useSliceImage } from '@/hooks/useSliceImage';
import { useSliceScroll } from '@/hooks/useSliceScroll';
import {
  type LetterboxRect,
  imageToPanel,
  letterboxRect,
  pointerToImageFrac,
} from '@/lib/volume/letterbox';
import {
  fracToVoxel,
  planeAspect,
  sliceAxis,
  sliceCount,
  sliceNumber,
  voxelToFrac,
} from '@/lib/volume/plane';
import { useVolumeStore } from '@/store';
import type { SliceImage, SlicePlane, Vec3, VolumeCursor } from '@/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const axisColor = (axis: Axis) => ACCENT_VAR[AXIS_ACCENT[axis]];
export const axisGlow = (axis: Axis) => accentRgba(AXIS_ACCENT[axis], 0.45);

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

function useCanvasSize(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const [size, setSize] = useState({ w: 1, h: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(1, width), h: Math.max(1, height) });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef]);

  return size;
}

/**
 * Paints `image` into the canvas, letterboxed to `rect`. The offscreen buffer
 * is only resized when the slice dimensions change, so scrubbing repaints
 * without reallocating.
 */
function useCanvasPainter(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  image: SliceImage | null,
  rect: LetterboxRect | null,
  size: { w: number; h: number },
) {
  const offscreen = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(size.w * dpr));
    const height = Math.max(1, Math.floor(size.h * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, width, height);
    if (!image) return;

    if (!offscreen.current) offscreen.current = document.createElement('canvas');
    const buffer = offscreen.current;
    if (buffer.width !== image.width) buffer.width = image.width;
    if (buffer.height !== image.height) buffer.height = image.height;

    const bufferCtx = buffer.getContext('2d');
    if (!bufferCtx) return;
    bufferCtx.putImageData(
      new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
      0,
      0,
    );

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (rect) {
      ctx.drawImage(
        buffer,
        rect.x * width,
        rect.y * height,
        rect.width * width,
        rect.height * height,
      );
    } else {
      ctx.drawImage(buffer, 0, 0, width, height);
    }
  }, [canvasRef, image, rect, size]);
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

  const activePlane = useVolumeStore((s) => s.activePlane);
  const setActivePlane = useVolumeStore((s) => s.setActivePlane);
  const setCursor = useVolumeStore((s) => s.setCursor);
  const requestSnapToView = useVolumeStore((s) => s.requestSnapToView);
  const dims = useVolumeStore((s) => s.volume?.meta.dims);
  const spacing = useVolumeStore((s) => s.volume?.meta.spacing);
  const cursor = useVolumeStore((s) => s.cursor);
  const scrubVisible = useVolumeStore((s) => s.scrubVisible[plane]);
  const setScrubVisible = useVolumeStore((s) => s.setScrubVisible);

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

  useCanvasPainter(canvasRef, image, drawFracs, canvasSize);

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
      measurement: measureInteraction.measurement,
      dots: adjustedDots,
      menu: measureInteraction.menu,
      closeMenu: measureInteraction.closeMenu,
      onContextMenu: handleContextMenu,
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
