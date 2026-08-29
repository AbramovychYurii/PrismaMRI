import { PLANE_CROSSHAIR_AXES } from '@/constants';
import { axisColor, axisGlow } from '@/hooks/useSlicePanelCore';
import type { SlicePlane } from '@/types';
import { memo } from 'react';
import {
  CrossCenter,
  CrossDot,
  CrossH,
  CrossV,
  CrosshairOverlay,
  MEASURE_DOT_PX,
  MEASURE_DOT_SHADOW,
  MeasureDot,
  MeasureLabel,
  MeasureLine,
} from './SlicePanel.styles';

const MEASURE_LINE_STROKE_STYLE: React.CSSProperties = { stroke: 'var(--measure)' };

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
        <CrosshairOverlay>
          <CrossH
            $color={axisColor(axes.h)}
            $glow={axisGlow(axes.h)}
            style={{ top: `${cross.fy * 100}%` }}
          />
          <CrossV
            $color={axisColor(axes.v)}
            $glow={axisGlow(axes.v)}
            style={{ left: `${cross.fx * 100}%` }}
          />
          <CrossCenter style={{ left: `${cross.fx * 100}%`, top: `${cross.fy * 100}%` }}>
            <CrossDot />
          </CrossCenter>
        </CrosshairOverlay>
      )}
      {hasLine && (
        <MeasureLine aria-hidden="true">
          <line
            x1={`${dots[0].fx * 100}%`}
            y1={`${dots[0].fy * 100}%`}
            x2={`${dots[1].fx * 100}%`}
            y2={`${dots[1].fy * 100}%`}
            style={MEASURE_LINE_STROKE_STYLE}
            strokeWidth="1.5"
            strokeDasharray="5 4"
            opacity="0.75"
            filter="drop-shadow(0 0 4px var(--measure-glow))"
          />
        </MeasureLine>
      )}
      {dots.map((dot, i) => (
        // Keyed by role (0 = from, 1 = to): coordinates collide when both
        // points coincide, which breaks reconciliation and leaks DOM nodes.
        <MeasureDot
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
        <MeasureLabel
          style={{
            left: `${((dots[0].fx + dots[1].fx) / 2) * 100}%`,
            top: `${((dots[0].fy + dots[1].fy) / 2) * 100}%`,
          }}
        >
          {distanceMm.toFixed(1)} mm
        </MeasureLabel>
      )}
    </>
  );
});
