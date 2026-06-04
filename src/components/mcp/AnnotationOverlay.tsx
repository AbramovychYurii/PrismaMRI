/**
 * AnnotationOverlay
 *
 * Renders AI findings on a single 2-D slice panel.  Each marker is anchored to
 * the slice on which it was detected: it only appears when the current slice on
 * this plane is within the active slab range of the finding's voxel coordinate.
 *
 * Markers are colour-coded by clinical severity, thin enough not to obscure the
 * underlying anatomy, and clickable — selecting one focuses it (opens the
 * summary card and emphasises it in 3-D).
 */

import { SEVERITY_HEX } from '@/constants';
import { useVolumeStore } from '@/store/volumeStore';
import type { AiAnnotation, SlicePlane, VolumeCursor } from '@/types';
import styled from 'styled-components';

// ── Geometry ─────────────────────────────────────────────────────────────────

/** The finding's slice index on a given plane (0-based voxel coord). */
function sliceCoord(plane: SlicePlane, v: VolumeCursor): number {
  if (plane === 'coronal') return v.y;
  if (plane === 'sagittal') return v.x;
  return v.z;
}

/** Current cursor's slice index on a given plane. */
function cursorCoord(plane: SlicePlane, c: VolumeCursor): number {
  if (plane === 'coronal') return c.y;
  if (plane === 'sagittal') return c.x;
  return c.z;
}

// ── Styled components ────────────────────────────────────────────────────────

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: var(--z-panel-top);
  overflow: visible;
`;

const Pin = styled.button<{ $color: string; $active: boolean }>`
  position: absolute;
  transform: translate(-50%, -50%);
  width: ${({ $active }) => ($active ? '30px' : '24px')};
  height: ${({ $active }) => ($active ? '30px' : '24px')};
  border-radius: 50%;
  padding: 0;
  background: transparent;
  /* Thin ring — kept slim so it never hides the underlying anatomy. */
  border: ${({ $active }) => ($active ? '1.75px' : '1.25px')} solid ${({ $color }) => $color};
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.55),
    0 0 ${({ $active }) => ($active ? '12px' : '6px')} ${({ $color }) => $color}aa;
  cursor: pointer;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;
  animation: annotation-pulse 2.4s ease-in-out infinite;

  @keyframes annotation-pulse {
    0%, 100% { box-shadow: 0 0 0 1px rgba(0,0,0,0.55), 0 0 6px ${({ $color }) => $color}88; }
    50%       { box-shadow: 0 0 0 1px rgba(0,0,0,0.55), 0 0 13px ${({ $color }) => $color}dd; }
  }
`;

const PinLabel = styled.span<{
  $color: string;
  $side: 'left' | 'right';
  $vSide: 'top' | 'bottom' | 'center';
}>`
  position: absolute;
  ${({ $side }) => ($side === 'right' ? 'left: calc(100% + 7px);' : 'right: calc(100% + 7px);')}
  ${({ $vSide }) =>
    $vSide === 'center'
      ? 'top: 50%; transform: translateY(-50%);'
      : $vSide === 'top'
        ? 'top: 0;'
        : 'bottom: 0;'}
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  white-space: nowrap;
  color: ${({ $color }) => $color};
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  background: rgba(8, 7, 5, 0.72);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid ${({ $color }) => $color}44;
  pointer-events: none;
`;

// ── Component ────────────────────────────────────────────────────────────────

function PinItem({
  annotation,
  active,
  opacity,
  onSelect,
}: {
  annotation: AiAnnotation;
  active: boolean;
  opacity: number;
  onSelect: (id: string) => void;
}) {
  const color = SEVERITY_HEX[annotation.severity];
  const labelSide = annotation.fx > 0.55 ? 'left' : 'right';
  const labelVSide = annotation.fy < 0.15 ? 'top' : annotation.fy > 0.85 ? 'bottom' : 'center';
  return (
    <Pin
      type="button"
      $color={color}
      $active={active}
      style={{ left: `${annotation.fx * 100}%`, top: `${annotation.fy * 100}%`, opacity }}
      title={annotation.label}
      aria-label={`${annotation.severity}: ${annotation.label}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(annotation.id);
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {active && (
        <PinLabel $color={color} $side={labelSide} $vSide={labelVSide}>
          {annotation.label}
        </PinLabel>
      )}
    </Pin>
  );
}

export function AnnotationOverlay({
  plane,
  halfSlabs = 0,
}: {
  plane: SlicePlane;
  halfSlabs?: number;
}) {
  const annotations = useVolumeStore((s) => s.aiAnnotations);
  const cursor = useVolumeStore((s) => s.cursor);
  const activeId = useVolumeStore((s) => s.activeAnnotationId);
  const focusAnnotation = useVolumeStore((s) => s.focusAnnotation);

  if (!cursor) return null;

  // Reveal markers on the exact slice ±1, widening with the active slab.
  const tol = Math.max(halfSlabs, 1);
  const cur = cursorCoord(plane, cursor);

  const visible = annotations
    .filter((a) => a.plane === plane)
    .map((a) => ({ a, dist: Math.abs(sliceCoord(plane, a.voxel) - cur) }))
    .filter(({ dist }) => dist <= tol);

  if (visible.length === 0) return null;

  return (
    <Overlay>
      {visible.map(({ a, dist }) => (
        <PinItem
          key={a.id}
          annotation={a}
          active={a.id === activeId}
          opacity={a.id === activeId ? 1 : 1 - (dist / (tol + 1)) * 0.55}
          onSelect={focusAnnotation}
        />
      ))}
    </Overlay>
  );
}
