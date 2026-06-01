import { accentRgba } from '@/constants';
import { Eye, MapPin, Ruler, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

// ── Styled components ──────────────────────────────────────────────────────

const Menu = styled.div`
  position: fixed;
  z-index: var(--z-popover);
  background: var(--surface-glass);
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 3px 0;
  min-width: 196px;
  box-shadow:
    0 8px 28px rgba(0, 0, 0, 0.7),
    0 0 0 1px var(--highlight-xs);
  backdrop-filter: blur(12px);
`;

const Item = styled.button`
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 13px;
  background: none;
  border: none;
  color: var(--ink-2);
  font-family: var(--sans);
  font-size: 12.5px;
  line-height: 1;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;

  &:hover {
    background: var(--highlight-sm);
    color: var(--ink);
  }
`;

const DangerItem = styled(Item)`
  color: var(--ink-3);

  &:hover {
    background: ${accentRgba('amber', 0.08)};
    color: var(--amber);
  }
`;

const Divider = styled.div`
  height: 1px;
  background: var(--rule);
  margin: 3px 0;
`;

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  x: number;
  y: number;
  hasMeasurementFrom: boolean;
  onMeasureFrom: () => void;
  onMeasureTo: () => void;
  onSnapToView: () => void;
  onClear: () => void;
  onClose: () => void;
}

export function MeasureMenu({
  x,
  y,
  hasMeasurementFrom,
  onMeasureFrom,
  onMeasureTo,
  onSnapToView,
  onClear,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Clamp to viewport so menu never overflows edge — items: measure-from (+
  // optional measure-to) → divider → view-from-here → optional clear group.
  const menuW = 200;
  const baseH = 44 + 8 + 36; // measure-from + divider + view-from-here
  const menuH = hasMeasurementFrom ? baseH + 36 + 8 + 36 : baseH;
  const safeX = Math.min(x, window.innerWidth - menuW - 8);
  const safeY = Math.min(y, window.innerHeight - menuH - 8);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function wrap(fn: () => void) {
    return () => {
      fn();
      onClose();
    };
  }

  return createPortal(
    <Menu ref={ref} style={{ left: safeX, top: safeY }} onClick={(e) => e.stopPropagation()}>
      <Item type="button" onClick={wrap(onMeasureFrom)}>
        <MapPin size={12} />
        Measure from here
      </Item>
      {hasMeasurementFrom && (
        <Item type="button" onClick={wrap(onMeasureTo)}>
          <Ruler size={12} />
          Measure to here
        </Item>
      )}
      <Divider />
      <Item type="button" onClick={wrap(onSnapToView)}>
        <Eye size={12} />
        View from this side
      </Item>
      {hasMeasurementFrom && (
        <>
          <Divider />
          <DangerItem type="button" onClick={wrap(onClear)}>
            <Trash2 size={12} />
            Clear measurement
          </DangerItem>
        </>
      )}
    </Menu>,
    document.body,
  );
}
