import type { Axis, SlicePlane } from '@prisma-mri/viewer-core';
import { type CSSProperties, memo } from 'react';
import { PLANE_CROSSHAIR_AXES } from '../../constants';
import { axisColor, axisGlow } from '../../hooks/useSlicePanelCore';
import styles from './SlicePanel.module.css';
import { MEASURE_DOT_PX, MEASURE_DOT_SHADOW } from './SlicePanel.styles';

/** A crosshair line at `position`, coloured and glowing for its axis. */
function crossStyle(axis: Axis, position: CSSProperties): CSSProperties {
  return {
    ...position,
    '--cross-color': axisColor(axis),
    '--cross-glow': axisGlow(axis),
  } as CSSProperties;
}

const MEASURE_LINE_STROKE_STYLE: React.CSSProperties = { stroke: 'var(--pmri-measure)' };

/**
 * Crosshair lines and measurement marks drawn over a slice canvas.
 *
 * Memoised because it re-renders on every cursor move while the panel around
 * it does not need to: everything it draws is positioned in percentages, so
 * nothing here depends on the panel's size.
 */
export const SliceCrosshair = memo(function SliceCrosshair({
  plane,
  cross,
  dots,
  distanceMm,
}: {
  plane: SlicePlane;
  cross: { fx: number; fy: number } | null;
  dots: Array<{ fx: number; fy: number }>;
  distanceMm?: number | null;
}) {
  const axes = PLANE_CROSSHAIR_AXES[plane];
  const hasLine = dots.length === 2;
  return (
    <>
      {cross && (
        <div className={styles.crosshairOverlay}>
          <div
            className={styles.crossH}
            style={crossStyle(axes.h, { top: `${cross.fy * 100}%` })}
          />
          <div
            className={styles.crossV}
            style={crossStyle(axes.v, { left: `${cross.fx * 100}%` })}
          />
          <div
            className={styles.crossCenter}
            style={{ left: `${cross.fx * 100}%`, top: `${cross.fy * 100}%` }}
          >
            <span className={styles.crossDot} />
          </div>
        </div>
      )}
      {hasLine && (
        <svg className={styles.measureLine} aria-hidden="true">
          <line
            x1={`${dots[0].fx * 100}%`}
            y1={`${dots[0].fy * 100}%`}
            x2={`${dots[1].fx * 100}%`}
            y2={`${dots[1].fy * 100}%`}
            style={MEASURE_LINE_STROKE_STYLE}
            strokeWidth="1.5"
            strokeDasharray="5 4"
            opacity="0.75"
            filter="drop-shadow(0 0 4px var(--pmri-measure-glow))"
          />
        </svg>
      )}
      {dots.map((dot, i) => (
        // Keyed by role (0 = from, 1 = to): coordinates collide when both
        // points coincide, which breaks reconciliation and leaks DOM nodes.
        <div
          className={styles.measureDot}
          // biome-ignore lint/suspicious/noArrayIndexKey: stable role-based key
          key={i}
          style={{
            left: `${dot.fx * 100}%`,
            top: `${dot.fy * 100}%`,
            width: `${MEASURE_DOT_PX}px`,
            height: `${MEASURE_DOT_PX}px`,
            boxShadow: MEASURE_DOT_SHADOW,
          }}
        />
      ))}
      {hasLine && distanceMm !== null && distanceMm !== undefined && (
        <div
          className={styles.measureLabel}
          style={{
            left: `${((dots[0].fx + dots[1].fx) / 2) * 100}%`,
            top: `${((dots[0].fy + dots[1].fy) / 2) * 100}%`,
          }}
        >
          {distanceMm.toFixed(1)} mm
        </div>
      )}
    </>
  );
});
