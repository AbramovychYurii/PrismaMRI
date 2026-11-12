/**
 * Renders AI findings on one 2-D slice panel. A marker appears only while the
 * current slice is within the active slab range of the finding's voxel, and
 * selecting it focuses the finding across the whole app.
 */

import { type Annotation, type SlicePlane, sliceIndex } from '@prisma-mri/viewer-core';
import { type CSSProperties, memo, useMemo } from 'react';
import { useViewerFeatures, useViewerStore, useViewerTheme } from '../../viewer';
import styles from './AnnotationOverlay.module.css';

const PinItem = memo(function PinItem({
  annotation,
  active,
  opacity,
  onSelect,
}: {
  annotation: Annotation;
  active: boolean;
  opacity: number;
  onSelect: (id: string) => void;
}) {
  const color = useViewerTheme().severity[annotation.severity];
  const labelSide = annotation.fx > 0.55 ? 'left' : 'right';
  const labelVSide = annotation.fy < 0.15 ? 'top' : annotation.fy > 0.85 ? 'bottom' : 'center';
  return (
    <button
      className={styles.pin}
      type="button"
      data-active={active || undefined}
      style={
        {
          left: `${annotation.fx * 100}%`,
          top: `${annotation.fy * 100}%`,
          opacity,
          '--pin-color': color,
        } as CSSProperties
      }
      title={annotation.label}
      aria-label={`${annotation.severity}: ${annotation.label}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(annotation.id);
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {active && (
        <span className={styles.pinLabel} data-side={labelSide} data-vside={labelVSide}>
          {annotation.label}
        </span>
      )}
    </button>
  );
});

export function AnnotationOverlay({
  plane,
  halfSlabs = 0,
}: {
  plane: SlicePlane;
  halfSlabs?: number;
}) {
  const annotations = useViewerStore((s) => s.annotations);
  const cursor = useViewerStore((s) => s.cursor);
  const activeId = useViewerStore((s) => s.activeAnnotationId);
  const focusAnnotation = useViewerStore((s) => s.focusAnnotation);

  // Reveal markers on the exact slice ±1, widening with the active slab.
  const tol = Math.max(halfSlabs, 1);
  const currentSlice = cursor ? sliceIndex(cursor, plane) : 0;

  const visible = useMemo(() => {
    if (!cursor) return [];
    return annotations
      .filter((a) => a.plane === plane)
      .map((a) => ({ a, dist: Math.abs(sliceIndex(a.voxel, plane) - currentSlice) }))
      .filter(({ dist }) => dist <= tol);
  }, [annotations, plane, currentSlice, tol, cursor]);

  const { annotations: enabled } = useViewerFeatures();
  if (!enabled || !cursor || visible.length === 0) return null;

  return (
    <div className={styles.overlay}>
      {visible.map(({ a, dist }) => (
        <PinItem
          key={a.id}
          annotation={a}
          active={a.id === activeId}
          opacity={a.id === activeId ? 1 : 1 - (dist / (tol + 1)) * 0.55}
          onSelect={focusAnnotation}
        />
      ))}
    </div>
  );
}
