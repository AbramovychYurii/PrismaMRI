import { useState, useMemo, useCallback } from "react";
import { useVolumeStore } from "@/store";
import { clamp } from "@/lib/volume/math";
import type {
  ActiveMeasurement,
  MeasurementPoint,
  SlicePlane,
  VolumeCursor,
} from "@/types";

// ── Types ──────────────────────────────────────────────────────────────────

/** Letterboxed image rect as fractions of the panel [0..1]. */
export interface DrawFracs {
  xF: number;
  yF: number;
  wF: number;
  hF: number;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

function measureDotFrac(
  plane: SlicePlane,
  dims: readonly [number, number, number],
  cursor: VolumeCursor,
  pt: MeasurementPoint,
): { fx: number; fy: number } | null {
  const [w, h, d] = dims;
  if (plane === "coronal") {
    if (pt.y !== cursor.y) return null;
    return {
      fx: pt.x / Math.max(1, w - 1),
      fy: (d - 1 - pt.z) / Math.max(1, d - 1),
    };
  }
  if (plane === "sagittal") {
    if (pt.x !== cursor.x) return null;
    return {
      fx: pt.y / Math.max(1, h - 1),
      fy: (d - 1 - pt.z) / Math.max(1, d - 1),
    };
  }
  if (pt.z !== cursor.z) return null;
  return { fx: pt.x / Math.max(1, w - 1), fy: pt.y / Math.max(1, h - 1) };
}

function collectDots(
  plane: SlicePlane,
  dims: readonly [number, number, number] | undefined,
  cursor: VolumeCursor | null,
  measurement: ActiveMeasurement | null,
): Array<{ fx: number; fy: number }> {
  if (!dims || !cursor || !measurement) return [];
  const dots: Array<{ fx: number; fy: number }> = [];
  const from = measureDotFrac(plane, dims, cursor, measurement.from);
  if (from) dots.push(from);
  if (measurement.to) {
    const to = measureDotFrac(plane, dims, cursor, measurement.to);
    if (to) dots.push(to);
  }
  return dots;
}

function screenToVoxel(
  plane: SlicePlane,
  dims: readonly [number, number, number],
  cursor: VolumeCursor,
  canvas: HTMLCanvasElement,
  e: React.MouseEvent,
  drawFracs?: DrawFracs | null,
): MeasurementPoint {
  const rect = canvas.getBoundingClientRect();
  let fx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
  let fy = clamp((e.clientY - rect.top) / rect.height, 0, 1);
  if (drawFracs) {
    fx = clamp((fx - drawFracs.xF) / drawFracs.wF, 0, 1);
    fy = clamp((fy - drawFracs.yF) / drawFracs.hF, 0, 1);
  }
  const [w, h, d] = dims;
  const voxel: MeasurementPoint = { ...cursor };
  if (plane === "coronal") {
    voxel.x = Math.round(fx * (w - 1));
    voxel.z = Math.round((1 - fy) * (d - 1));
  } else if (plane === "sagittal") {
    voxel.y = Math.round(fx * (h - 1));
    voxel.z = Math.round((1 - fy) * (d - 1));
  } else {
    voxel.x = Math.round(fx * (w - 1));
    voxel.y = Math.round(fy * (h - 1));
  }
  return voxel;
}

// ── Hook ───────────────────────────────────────────────────────────────────

interface MenuState {
  screenX: number;
  screenY: number;
  voxel: MeasurementPoint;
}

export function useMeasurementInteraction(
  plane: SlicePlane,
  dims: readonly [number, number, number] | undefined,
  cursor: VolumeCursor | null,
) {
  const measurement = useVolumeStore((s) => s.measurement);
  const setMeasurementFrom = useVolumeStore((s) => s.setMeasurementFrom);
  const setMeasurementTo = useVolumeStore((s) => s.setMeasurementTo);
  const clearMeasurement = useVolumeStore((s) => s.clearMeasurement);

  const [menu, setMenu] = useState<MenuState | null>(null);

  const measureDots = useMemo(
    () => collectDots(plane, dims, cursor, measurement),
    [plane, dims, cursor, measurement],
  );

  const openMenu = useCallback(
    (e: React.MouseEvent, canvas: HTMLCanvasElement, drawFracs?: DrawFracs | null) => {
      if (!dims || !cursor) return;
      setMenu({
        screenX: e.clientX,
        screenY: e.clientY,
        voxel: screenToVoxel(plane, dims, cursor, canvas, e, drawFracs),
      });
    },
    [plane, dims, cursor],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const onMeasureFrom = useCallback(() => {
    if (menu) setMeasurementFrom(menu.voxel);
  }, [menu, setMeasurementFrom]);

  const onMeasureTo = useCallback(() => {
    if (menu) setMeasurementTo(menu.voxel);
  }, [menu, setMeasurementTo]);

  return {
    measurement,
    measureDots,
    menu,
    openMenu,
    closeMenu,
    onMeasureFrom,
    onMeasureTo,
    onClear: clearMeasurement,
  };
}
