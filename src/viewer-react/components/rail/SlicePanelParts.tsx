import type { SlicePlane } from '@prisma-mri/viewer-core';
import { Download } from 'lucide-react';
import { memo } from 'react';
import { PLANE_ACCENT, PLANE_GLYPH } from '../../constants';
import type { SlicePanelCore } from '../../hooks/useSlicePanelCore';
import { downloadBlob } from '../../util/download';
import { useViewerLabels } from '../../viewer';
import { Tooltip } from '../ui/Tooltip';
import { MeasureMenu } from './MeasureMenu';
import styles from './SlicePanel.module.css';

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
      <button
        className={styles.trayBtn}
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        data-active={active || undefined}
        data-large={large || undefined}
      >
        {children}
      </button>
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

/** Everything here is a lookup on `plane` and the labels — no panel state involved. */
export function PlaneHeading({ plane }: { plane: SlicePlane }) {
  const accent = PLANE_ACCENT[plane];
  const label = useViewerLabels().planes[plane];
  return (
    <div className={styles.panelHeader}>
      <span className={styles.planeGlyph} style={{ color: accent }}>
        {PLANE_GLYPH[plane]}
      </span>
      <span className={styles.planeLabel}>
        <b className={styles.planeLabelAccent} style={{ color: accent }}>
          {label.name}
        </b>
        {` · ${label.detail}`}
      </span>
    </div>
  );
}

export function SliceCount({ idx, total }: { idx: number; total: number }) {
  return (
    <span className={styles.sliceCounter}>
      <span>{idx}</span>
      <span className={styles.sliceDim}> / {total}</span>
    </span>
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
      canMeasure={measure.enabled}
      hasMeasurementFrom={measure.measurement !== null}
      onMeasureFrom={measure.onMeasureFrom}
      onMeasureTo={measure.onMeasureTo}
      onSnapToView={onSnapToView}
      onClear={measure.onClear}
      onClose={measure.closeMenu}
    />
  );
}
