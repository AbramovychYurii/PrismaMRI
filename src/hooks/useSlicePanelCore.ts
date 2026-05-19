import {
  ACCENT_VAR,
  AXIS_ACCENT,
  type Axis,
  PLANE_ACCENT,
  PLANE_LABEL,
  accentRgba,
} from '@/constants';
import type { DrawFracs } from '@/hooks/useMeasurementInteraction';
import { useMeasurementInteraction } from '@/hooks/useMeasurementInteraction';
import { useSliceImage } from '@/hooks/useSliceImage';
import { useSliceScroll } from '@/hooks/useSliceScroll';
import { clamp } from '@/lib/volume/math';
import { useVolumeStore } from '@/store';
import type { SlicePlane, VolumeCursor } from '@/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Pure geometry helpers ─────────────────────────────────────────────────

function physicalAspect(
  plane: SlicePlane,
  dims: readonly [number, number, number],
  spacing: readonly [number, number, number],
): number {
  const [sx, sy, sz] = spacing;
  const [w, h, d] = dims;
  if (plane === 'coronal') return (w * sx) / (d * sz);
  if (plane === 'sagittal') return (h * sy) / (d * sz);
  return (w * sx) / (h * sy);
}

/** Returns the letterboxed image rect as panel-space fractions [0..1]. */
function computeDrawFracs(physAspect: number, cw: number, ch: number): DrawFracs {
  if (physAspect >= cw / ch) {
    const drawH = cw / physAspect;
    return { xF: 0, yF: (ch - drawH) / 2 / ch, wF: 1, hF: drawH / ch };
  }
  const drawW = ch * physAspect;
  return { xF: (cw - drawW) / 2 / cw, yF: 0, wF: drawW / cw, hF: 1 };
}

function imageToPanel(imgFx: number, imgFy: number, df: DrawFracs) {
  return { fx: df.xF + imgFx * df.wF, fy: df.yF + imgFy * df.hF };
}

function panelToImage(panelFx: number, panelFy: number, df: DrawFracs) {
  return {
    fx: clamp((panelFx - df.xF) / df.wF, 0, 1),
    fy: clamp((panelFy - df.yF) / df.hF, 0, 1),
  };
}

function sliceIndexInfo(
  plane: SlicePlane,
  dims: readonly [number, number, number] | undefined,
  cursor: VolumeCursor | null,
): { idx: number; total: number } {
  if (!dims || !cursor) return { idx: 0, total: 0 };
  if (plane === 'coronal') return { idx: cursor.y + 1, total: dims[1] };
  if (plane === 'sagittal') return { idx: cursor.x + 1, total: dims[0] };
  return { idx: cursor.z + 1, total: dims[2] };
}

/**
 * Crosshair position as 0..1 fractions of the (stretched) slice image.
 * Coronal/Sagittal render z reversed (row 0 = z=depth-1).
 */
function crosshairFrac(
  plane: SlicePlane,
  dims: readonly [number, number, number],
  c: VolumeCursor,
): { fx: number; fy: number } {
  const [w, h, d] = dims;
  if (plane === 'coronal') {
    return { fx: c.x / Math.max(1, w - 1), fy: (d - 1 - c.z) / Math.max(1, d - 1) };
  }
  if (plane === 'sagittal') {
    return { fx: c.y / Math.max(1, h - 1), fy: (d - 1 - c.z) / Math.max(1, d - 1) };
  }
  return { fx: c.x / Math.max(1, w - 1), fy: c.y / Math.max(1, h - 1) };
}

/**
 * Which axis each crosshair line represents on a panel — the vertical line
 * carries the `fx` coordinate, the horizontal line the `fy`. Each panel shows
 * the two axes orthogonal to its own, tinted with their system colors.
 */
function crosshairAxes(plane: SlicePlane): { v: Axis; h: Axis } {
  if (plane === 'coronal') return { v: 'y', h: 'z' };
  if (plane === 'sagittal') return { v: 'x', h: 'z' };
  return { v: 'y', h: 'x' };
}

export const axisColor = (a: Axis) => ACCENT_VAR[AXIS_ACCENT[a]];
export const axisGlow = (a: Axis) => accentRgba(AXIS_ACCENT[a], 0.45);

// ── Exported pure utility ─────────────────────────────────────────────────

/**
 * Converts a mouse click position to a new cursor in voxel space.
 * Extracted so both SlicePanel and ExpandedSlicePanel share the same logic.
 */
export function cursorFromClick(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  plane: SlicePlane,
  dims: readonly [number, number, number],
  cursor: VolumeCursor,
  drawFracs: DrawFracs | null,
): VolumeCursor {
  const rect = canvas.getBoundingClientRect();
  const panelFx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
  const panelFy = clamp((e.clientY - rect.top) / rect.height, 0, 1);
  const { fx, fy } = drawFracs
    ? panelToImage(panelFx, panelFy, drawFracs)
    : { fx: panelFx, fy: panelFy };
  const [w, h, d] = dims;
  const next: VolumeCursor = { ...cursor };
  if (plane === 'coronal') {
    next.x = Math.round(fx * (w - 1));
    next.z = Math.round((1 - fy) * (d - 1));
  } else if (plane === 'sagittal') {
    next.y = Math.round(fx * (h - 1));
    next.z = Math.round((1 - fy) * (d - 1));
  } else {
    next.x = Math.round(fx * (w - 1));
    next.y = Math.round(fy * (h - 1));
  }
  return next;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export interface SlicePanelCore {
  // Canvas
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  // Geometry
  drawFracs: DrawFracs | null;
  // Slice info
  idx: number;
  total: number;
  // Visual crosshair
  cross: { fx: number; fy: number } | null;
  adjustedDots: Array<{ fx: number; fy: number }>;
  axes: { v: Axis; h: Axis };
  // Styling
  accentColor: string;
  planeLabel: { primary: string; secondary: string };
  // Active state
  isActive: boolean;
  // Store state
  cursor: VolumeCursor | null;
  dims: readonly [number, number, number] | undefined;
  scrubVisible: boolean;
  // Store actions
  setActivePlane: (p: SlicePlane) => void;
  setCursor: (c: VolumeCursor) => void;
  setScrubVisible: (axis: SlicePlane, value: boolean) => void;
  requestSnapToView: (plane: SlicePlane) => void;
  // Handlers
  onWheel: (e: React.WheelEvent) => void;
  handleScrub: (nextSlice: number) => void;
  handleContextMenu: (e: React.MouseEvent) => void;
  // Measurement
  measurement: ReturnType<typeof useMeasurementInteraction>['measurement'];
  menu: ReturnType<typeof useMeasurementInteraction>['menu'];
  openMenu: ReturnType<typeof useMeasurementInteraction>['openMenu'];
  closeMenu: ReturnType<typeof useMeasurementInteraction>['closeMenu'];
  onMeasureFrom: ReturnType<typeof useMeasurementInteraction>['onMeasureFrom'];
  onMeasureTo: ReturnType<typeof useMeasurementInteraction>['onMeasureTo'];
  onClear: ReturnType<typeof useMeasurementInteraction>['onClear'];
}

/**
 * Encapsulates the shared state and behaviour of slice panels.
 * Both `SlicePanel` (rail) and `ExpandedSlicePanel` (fullscreen portal)
 * use this hook so canvas setup, rendering, scrubbing, and measurement
 * logic live in exactly one place.
 */
export function useSlicePanelCore(plane: SlicePlane): SlicePanelCore {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreen = useRef<HTMLCanvasElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 1, h: 1 });

  // ── Store selectors ───────────────────────────────────────────────────
  const activePlane = useVolumeStore((s) => s.activePlane);
  const setActivePlane = useVolumeStore((s) => s.setActivePlane);
  const setCursor = useVolumeStore((s) => s.setCursor);
  const requestSnapToView = useVolumeStore((s) => s.requestSnapToView);
  const dims = useVolumeStore((s) => s.volume?.meta.dims);
  const spacing = useVolumeStore((s) => s.volume?.meta.spacing);
  const cursor = useVolumeStore((s) => s.cursor);
  const scrubVisible = useVolumeStore((s) => s.scrubVisible[plane]);
  const setScrubVisible = useVolumeStore((s) => s.setScrubVisible);

  // ── Canvas size tracking ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setCanvasSize({ w: Math.max(1, width), h: Math.max(1, height) });
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Geometry ──────────────────────────────────────────────────────────
  const drawFracs = useMemo<DrawFracs | null>(() => {
    if (!dims || !spacing) return null;
    return computeDrawFracs(physicalAspect(plane, dims, spacing), canvasSize.w, canvasSize.h);
  }, [plane, dims, spacing, canvasSize]);

  // ── Sub-hooks ─────────────────────────────────────────────────────────
  const measureInteraction = useMeasurementInteraction(plane, dims, cursor);
  const image = useSliceImage(plane);
  const onWheel = useSliceScroll(plane);

  // ── Derived values ────────────────────────────────────────────────────
  const isActive = activePlane === plane;
  const { idx, total } = sliceIndexInfo(plane, dims, cursor);
  const axes = crosshairAxes(plane);
  const accentColor = PLANE_ACCENT[plane];
  const planeLabel = PLANE_LABEL[plane];

  const cross = useMemo(() => {
    if (!dims || !cursor) return null;
    const imgFrac = crosshairFrac(plane, dims, cursor);
    return drawFracs ? imageToPanel(imgFrac.fx, imgFrac.fy, drawFracs) : imgFrac;
  }, [plane, dims, cursor, drawFracs]);

  const adjustedDots = useMemo(
    () =>
      drawFracs
        ? measureInteraction.measureDots.map((d) => imageToPanel(d.fx, d.fy, drawFracs))
        : measureInteraction.measureDots,
    [measureInteraction.measureDots, drawFracs],
  );

  // ── Canvas paint ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.floor(canvasSize.w * dpr));
    const ch = Math.max(1, Math.floor(canvasSize.h * dpr));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#080604';
    ctx.fillRect(0, 0, cw, ch);
    if (!image) return;

    if (!offscreen.current) offscreen.current = document.createElement('canvas');
    const off = offscreen.current;
    off.width = image.width;
    off.height = image.height;
    const octx = off.getContext('2d');
    if (!octx) return;
    octx.putImageData(
      new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
      0,
      0,
    );

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (drawFracs) {
      ctx.drawImage(
        off,
        drawFracs.xF * cw,
        drawFracs.yF * ch,
        drawFracs.wF * cw,
        drawFracs.hF * ch,
      );
    } else {
      ctx.drawImage(off, 0, 0, cw, ch);
    }
  }, [image, drawFracs, canvasSize]);

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleScrub = useCallback(
    (nextSlice: number) => {
      if (!cursor) return;
      const i = nextSlice - 1;
      if (plane === 'coronal') setCursor({ ...cursor, y: i });
      else if (plane === 'sagittal') setCursor({ ...cursor, x: i });
      else setCursor({ ...cursor, z: i });
    },
    [cursor, plane, setCursor],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setActivePlane(plane);
      if (canvasRef.current) {
        measureInteraction.openMenu(e, canvasRef.current, drawFracs);
      }
    },
    [setActivePlane, plane, measureInteraction.openMenu, drawFracs],
  );

  return {
    canvasRef,
    drawFracs,
    idx,
    total,
    cross,
    adjustedDots,
    axes,
    accentColor,
    planeLabel,
    isActive,
    cursor,
    dims,
    scrubVisible,
    setActivePlane,
    setCursor,
    setScrubVisible,
    requestSnapToView,
    onWheel,
    handleScrub,
    handleContextMenu,
    measurement: measureInteraction.measurement,
    menu: measureInteraction.menu,
    openMenu: measureInteraction.openMenu,
    closeMenu: measureInteraction.closeMenu,
    onMeasureFrom: measureInteraction.onMeasureFrom,
    onMeasureTo: measureInteraction.onMeasureTo,
    onClear: measureInteraction.onClear,
  };
}
