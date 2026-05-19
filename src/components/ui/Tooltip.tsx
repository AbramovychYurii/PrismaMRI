import { useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

// ── Shared tooltip box ──────────────────────────────────────────────────────

const TipBox = styled.div<{ $x: number; $y: number; $above: boolean }>`
  position: fixed;
  left: ${({ $x }) => $x}px;
  top: ${({ $y }) => $y}px;
  transform: ${({ $above }) => ($above ? 'translate(-50%, -100%)' : 'translateX(-50%)')};
  white-space: nowrap;
  background: rgba(10, 8, 6, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 4px;
  padding: 4px 9px;
  font-family: var(--sans);
  font-size: 11px;
  color: var(--ink-2);
  pointer-events: none;
  z-index: 9999;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
  animation: _tip-in 80ms ease forwards;

  @keyframes _tip-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

// ── useTooltip hook — attach to any element directly ───────────────────────

/**
 * Returns mouse-event handlers + a portal node. Use when you need to attach
 * tooltip behaviour to a component that can't accept a wrapper (e.g. a
 * position:fixed button whose wrapper rect would be zero-sized).
 */
export function useTooltip(label: string, above = false) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const onMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: above ? r.top - 4 : r.bottom + 6 });
  };

  const onMouseLeave = () => setPos(null);

  const portal = pos
    ? createPortal(
        <TipBox $x={pos.x} $y={pos.y} $above={above}>
          {label}
        </TipBox>,
        document.body,
      )
    : null;

  return { onMouseEnter, onMouseLeave, portal };
}

// ── <Tooltip> wrapper — use when you control the children ──────────────────

interface TooltipProps {
  label: string;
  /** Show tooltip above instead of below (default: false). */
  above?: boolean;
  children: React.ReactNode;
}

/**
 * Wraps a single child in an inline-flex span and renders a fixed tooltip on
 * hover. The portal approach means it's never clipped by overflow:hidden.
 */
export function Tooltip({ label, above = false, children }: TooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  function handleMouseEnter(e: React.MouseEvent<HTMLSpanElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: above ? r.top - 4 : r.bottom + 6 });
  }

  return (
    <span
      style={{ display: 'inline-flex' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <TipBox $x={pos.x} $y={pos.y} $above={above}>
            {label}
          </TipBox>,
          document.body,
        )}
    </span>
  );
}
