import { MeasureMenu } from '@/components/rail/MeasureMenu';
import { Tooltip } from '@/components/ui/Tooltip';
import { PLANE_ACCENT, PLANE_GLYPH, PLANE_LABEL } from '@/constants';
import type { SlicePanelCore } from '@/hooks/useSlicePanelCore';
import { downloadBlob } from '@/lib/download';
import type { SlicePlane } from '@/types';
import { Download } from 'lucide-react';
import { memo } from 'react';
import {
  PanelHeader,
  PlaneGlyph,
  PlaneLabel,
  PlaneLabelAccent,
  SliceCounter,
  SliceDim,
  TrayBtn,
} from './SlicePanel.styles';

/**
 * The small pieces a slice panel is assembled from. Each takes only what it
 * draws, so none of them depends on the panel's state as a whole.
 */

export const TrayButton = memo(function TrayButton({
  label,
  active,
  large,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  large?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label}>
      <TrayBtn
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        $active={active}
        $large={large}
      >
        {children}
      </TrayBtn>
    </Tooltip>
  );
});

function downloadSlice(canvas: HTMLCanvasElement | null, plane: SlicePlane, idx: number): void {
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `prismamri-${plane}-${idx}.png`);
  }, 'image/png');
}

export function ExportSliceButton({
  canvasRef,
  plane,
  idx,
  large,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  plane: SlicePlane;
  idx: number;
  large?: boolean;
}) {
  return (
    <TrayButton
      large={large}
      label="Export slice as PNG"
      onClick={() => downloadSlice(canvasRef.current, plane, idx)}
    >
      <Download size={large ? 13 : 11} />
    </TrayButton>
  );
}

/** Everything here is a lookup on `plane` — no panel state involved. */
export function PlaneHeading({ plane }: { plane: SlicePlane }) {
  const accent = PLANE_ACCENT[plane];
  const label = PLANE_LABEL[plane];
  return (
    <PanelHeader>
      <PlaneGlyph $color={accent}>{PLANE_GLYPH[plane]}</PlaneGlyph>
      <PlaneLabel>
        <PlaneLabelAccent $color={accent}>{label.primary}</PlaneLabelAccent>
        {` · ${label.secondary}`}
      </PlaneLabel>
    </PanelHeader>
  );
}

export function SliceCount({ idx, total }: { idx: number; total: number }) {
  return (
    <SliceCounter>
      <span>{idx}</span>
      <SliceDim> / {total}</SliceDim>
    </SliceCounter>
  );
}

export function MeasureContextMenu({
  measure,
  onSnapToView,
}: {
  measure: SlicePanelCore['measure'];
  onSnapToView: () => void;
}) {
  if (!measure.menu) return null;
  return (
    <MeasureMenu
      x={measure.menu.screenX}
      y={measure.menu.screenY}
      hasMeasurementFrom={measure.measurement !== null}
      onMeasureFrom={measure.onMeasureFrom}
      onMeasureTo={measure.onMeasureTo}
      onSnapToView={onSnapToView}
      onClear={measure.onClear}
      onClose={measure.closeMenu}
    />
  );
}
