import { type LetterboxRect, pointerToImageFrac } from '@/lib/volume/letterbox';
import { fracToVoxel, sliceIndex, voxelToFrac } from '@/lib/volume/plane';
import { useVolumeStore } from '@/store';
import type { ActiveMeasurement, MeasurementPoint, SlicePlane, VolumeCursor } from '@/types';
import { useCallback, useMemo, useState } from 'react';

type PointerLike = { clientX: number; clientY: number };
type Dims = readonly [number, number, number];

/** Dot position on the panel, or null when the point sits on a different slice. */
function dotOnSlice(
  plane: SlicePlane,
  dims: Dims,
  cursor: VolumeCursor,
  point: MeasurementPoint,
): { fx: number; fy: number } | null {
  if (sliceIndex(point, plane) !== sliceIndex(cursor, plane)) return null;
  return voxelToFrac(plane, point, dims);
}

function visibleDots(
  plane: SlicePlane,
  dims: Dims | undefined,
  cursor: VolumeCursor | null,
  measurement: ActiveMeasurement | null,
): Array<{ fx: number; fy: number }> {
  if (!dims || !cursor || !measurement) return [];
  const points = measurement.to ? [measurement.from, measurement.to] : [measurement.from];
  return points
    .map((point) => dotOnSlice(plane, dims, cursor, point))
    .filter((dot): dot is { fx: number; fy: number } => dot !== null);
}

interface MenuState {
  screenX: number;
  screenY: number;
  voxel: MeasurementPoint;
}

export function useMeasurementInteraction(
  plane: SlicePlane,
  dims: Dims | undefined,
  cursor: VolumeCursor | null,
) {
  const measurement = useVolumeStore((s) => s.measurement);
  const setMeasurementFrom = useVolumeStore((s) => s.setMeasurementFrom);
  const setMeasurementTo = useVolumeStore((s) => s.setMeasurementTo);
  const clearMeasurement = useVolumeStore((s) => s.clearMeasurement);

  const [menu, setMenu] = useState<MenuState | null>(null);

  const measureDots = useMemo(
    () => visibleDots(plane, dims, cursor, measurement),
    [plane, dims, cursor, measurement],
  );

  const voxelAtPointer = useCallback(
    (event: PointerLike, canvas: HTMLCanvasElement, rect?: LetterboxRect | null) => {
      if (!dims || !cursor) return null;
      const { fx, fy } = pointerToImageFrac(event, canvas, rect ?? null);
      return fracToVoxel(plane, fx, fy, cursor, dims);
    },
    [plane, dims, cursor],
  );

  const openMenu = useCallback(
    (e: React.MouseEvent, canvas: HTMLCanvasElement, rect?: LetterboxRect | null) => {
      const voxel = voxelAtPointer(e, canvas, rect);
      if (voxel) setMenu({ screenX: e.clientX, screenY: e.clientY, voxel });
    },
    [voxelAtPointer],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const onMeasureFrom = useCallback(() => {
    if (menu) setMeasurementFrom(menu.voxel);
  }, [menu, setMeasurementFrom]);

  const onMeasureTo = useCallback(() => {
    if (menu) setMeasurementTo(menu.voxel);
  }, [menu, setMeasurementTo]);

  /**
   * Seeds `from` only — leaving `to` null until the pointer actually moves keeps
   * a bare click from creating a zero-length measurement with two stacked dots.
   */
  const beginDrag = useCallback(
    (event: PointerLike, canvas: HTMLCanvasElement, rect?: LetterboxRect | null) => {
      const voxel = voxelAtPointer(event, canvas, rect);
      if (voxel) setMeasurementFrom(voxel);
    },
    [voxelAtPointer, setMeasurementFrom],
  );

  const updateDrag = useCallback(
    (event: PointerLike, canvas: HTMLCanvasElement, rect?: LetterboxRect | null) => {
      const voxel = voxelAtPointer(event, canvas, rect);
      if (voxel) setMeasurementTo(voxel);
    },
    [voxelAtPointer, setMeasurementTo],
  );

  return {
    measurement,
    measureDots,
    menu,
    openMenu,
    closeMenu,
    onMeasureFrom,
    onMeasureTo,
    onClear: clearMeasurement,
    beginDrag,
    updateDrag,
  };
}
