/**
 * Styled components for SlicePanel + ExpandedSlicePanel.
 *
 * Layout: PanelWrap → StyledCanvas + overlays. Both the rail panel and the
 * fullscreen expanded view share the same chrome (PanelHeader, ButtonTray,
 * CrosshairOverlay, MeasureLine, MeasureDot).
 */

import { accentRgba } from '@/constants';
import styled from 'styled-components';

/** Fixed pixel size of measurement dots on 2-D slice panels. */
export const MEASURE_DOT_PX = 8;

/** Pre-computed box-shadow for measurement dots (constant size). */
export const MEASURE_DOT_SHADOW = `0 0 ${MEASURE_DOT_PX * 0.7}px var(--measure), 0 0 ${MEASURE_DOT_PX * 1.6}px var(--measure-glow)`;

export const PanelWrap = styled.div<{ $isLast: boolean; $isActive: boolean }>`
  position: relative;
  flex: 1;
  min-height: 0;
  background: var(--surface-deep);
  border-bottom: ${({ $isLast }) => ($isLast ? 'none' : '1px solid var(--rule)')};
  overflow: visible;
  cursor: ${({ $isActive }) => ($isActive ? 'crosshair' : 'pointer')};
  touch-action: none;
`;

export const StyledCanvas = styled.canvas`
  width: 100%;
  height: 100%;
  display: block;
`;

export const CrosshairOverlay = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: var(--z-overlay-local);
`;

export const CrossH = styled.div<{ $color: string; $glow: string }>`
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: ${({ $color }) => $color};
  opacity: 0.7;
  box-shadow: 0 0 4px ${({ $glow }) => $glow};
`;

export const CrossV = styled.div<{ $color: string; $glow: string }>`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: ${({ $color }) => $color};
  opacity: 0.7;
  box-shadow: 0 0 4px ${({ $glow }) => $glow};
`;

export const CrossCenter = styled.div`
  position: absolute;
  width: 14px;
  height: 14px;
  transform: translate(-50%, -50%);
`;

export const CrossDot = styled.span`
  position: absolute;
  inset: 4px;
  border: 1px solid var(--teal);
  border-radius: 99px;
  opacity: 0.7;
`;

export const PanelHeader = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 62px 0 14px;
  background: linear-gradient(
    to bottom,
    rgba(8, 7, 5, 0.92),
    rgba(8, 7, 5, 0.55) 70%,
    transparent
  );
  z-index: var(--z-panel-header);
  gap: 12px;
  min-width: 0;
`;

export const PlaneGlyph = styled.span<{ $color: string }>`
  font-family: var(--serif);
  font-style: italic;
  font-size: 18px;
  line-height: 1;
  font-weight: 500;
  color: ${({ $color }) => $color};
`;

export const PlaneLabel = styled.span`
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-2);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`;

export const PlaneLabelAccent = styled.b<{ $color: string }>`
  font-weight: 600;
  color: ${({ $color }) => $color};
`;

export const SliceCounter = styled.span`
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  flex-shrink: 0;
  margin-right: 3px;
`;

export const SliceDim = styled.span`
  color: var(--ink-3);
`;

export const PanelFooter = styled.div<{ $scrubVisible: boolean }>`
  position: absolute;
  bottom: 8px;
  left: 14px;
  right: ${({ $scrubVisible }) => ($scrubVisible ? '48px' : '14px')};
  z-index: var(--z-panel-header);
  display: flex;
  justify-content: space-between;
  font-family: var(--mono);
  font-size: 9.5px;
  color: var(--ink-3);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  pointer-events: none;
  transition: right 160ms ease;
`;

export const ActiveBorder = styled.div`
  position: absolute;
  inset: 0;
  z-index: var(--z-panel-chrome);
  border: 1.5px solid var(--amber);
  pointer-events: none;
  box-shadow: inset 0 0 0 1px ${accentRgba('amber', 0.15)};
`;

export const MeasureLine = styled.svg`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: var(--z-panel-top);
  overflow: visible;
`;

export const MeasureDot = styled.div`
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--measure);
  pointer-events: none;
  z-index: var(--z-panel-top);
`;

/** Live distance chip rendered next to the measurement line. */
export const MeasureLabel = styled.div`
  position: absolute;
  transform: translate(10px, -50%);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--measure);
  background: rgba(8, 7, 5, 0.82);
  border: 1px solid var(--measure-glow);
  border-radius: 3px;
  padding: 2px 6px;
  pointer-events: none;
  white-space: nowrap;
  z-index: var(--z-panel-top);
  box-shadow: 0 0 6px var(--measure-glow);
  font-variant-numeric: tabular-nums;
`;

export const ButtonTray = styled.div`
  position: absolute;
  top: 5px;
  right: 8px;
  z-index: var(--z-panel-top);
  display: flex;
  gap: 7px;
  pointer-events: auto;
`;

/**
 * Mobile-only right column: stacks Scrubber → Eye icon → Counter
 * using flex-column + gap so no pixel math is needed.
 */
export const MobileRightCol = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 46px;
  z-index: var(--z-panel-chrome);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 18px 6px 18px 4px;
  background: linear-gradient(to left, rgba(10, 8, 5, 0.85), transparent 70%);
  pointer-events: none;
`;

export const MobileCounter = styled.span`
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  flex-shrink: 0;
  pointer-events: none;
`;

export const TrayBtn = styled.button<{ $active?: boolean; $large?: boolean }>`
  width: ${({ $large }) => ($large ? '36px' : '24px')};
  height: ${({ $large }) => ($large ? '36px' : '24px')};
  flex-shrink: 0;
  border-radius: ${({ $large }) => ($large ? '6px' : '3px')};
  border: 1px solid ${({ $active }) => ($active ? 'var(--amber-dim)' : 'var(--rule)')};
  background: ${({ $active }) => ($active ? accentRgba('amber', 0.08) : 'rgba(15,13,10,0.90)')};
  color: ${({ $active }) => ($active ? 'var(--amber)' : 'var(--ink-3)')};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;

  ${({ $active }) =>
    !$active &&
    `&:hover {
      border-color: var(--rule-2);
      color: var(--ink);
    }`}

  @media (max-width: 767px) {
    width: 36px;
    height: 36px;
    border-radius: 6px;
  }
`;

export const FullscreenOverlay = styled.div<{ $isActive: boolean }>`
  position: fixed;
  top: 56px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-fullscreen);
  background: var(--surface-deep);
  overflow: hidden;
  cursor: ${({ $isActive }) => ($isActive ? 'crosshair' : 'default')};
`;
