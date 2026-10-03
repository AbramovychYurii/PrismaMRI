import { memo, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

const TipBox = styled.div<{ $x: number; $y: number; $above: boolean }>`
  position: fixed;
  left: ${({ $x }) => $x}px;
  top: ${({ $y }) => $y}px;
  transform: ${({ $above }) => ($above ? 'translate(-50%, -100%)' : 'translateX(-50%)')};
  white-space: nowrap;
  background: var(--surface-glass);
  border: 1px solid var(--highlight-border);
  border-radius: 4px;
  padding: 4px 9px;
  font-family: var(--sans);
  font-size: 11px;
  color: var(--ink-2);
  pointer-events: none;
  z-index: var(--z-popover);
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

/** Where the tip goes for an element: centred under it, or above it. */
function anchorOf(el: Element, above: boolean): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: above ? r.top - 4 : r.bottom + 6 };
}

/**
 * While a tip shows, Esc hides it — a tip must be dismissible without moving
 * the pointer or focus away (WCAG 1.4.13). Caught before anything else sees
 * the key and stopped there, so that press does only that: the next Esc goes
 * on to whatever the focused control sits in (a fullscreen panel, a dialog).
 */
function useDismissOnEscape(shown: boolean, hide: () => void): void {
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      hide();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [shown, hide]);
}

/**
 * Returns pointer and focus handlers + a portal node. Use when you need to
 * attach tooltip behaviour to a component that can't accept a wrapper (e.g. a
 * position:fixed button whose wrapper rect would be zero-sized). Shows on hover
 * and on keyboard focus alike.
 */
export function useTooltip(label: string, above = false) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const hide = useCallback(() => setPos(null), []);
  useDismissOnEscape(pos !== null, hide);

  const onMouseEnter = (e: React.MouseEvent<HTMLElement>) =>
    setPos(anchorOf(e.currentTarget, above));
  const onMouseLeave = hide;
  const onFocus = (e: React.FocusEvent<HTMLElement>) => {
    if (e.currentTarget.matches(':focus-visible')) setPos(anchorOf(e.currentTarget, above));
  };
  const onBlur = hide;

  const portal = pos
    ? createPortal(
        <TipBox role="tooltip" $x={pos.x} $y={pos.y} $above={above}>
          {label}
        </TipBox>,
        document.body,
      )
    : null;

  return { onMouseEnter, onMouseLeave, onFocus, onBlur, portal };
}

interface TooltipProps {
  label: string;
  /** Show tooltip above instead of below (default: false). */
  above?: boolean;
  children: React.ReactNode;
}

/**
 * Wraps a single child in an inline-flex span and renders a fixed tooltip on
 * hover and on keyboard focus of the child. The portal approach means it's
 * never clipped by overflow:hidden.
 */
export const Tooltip = memo(function Tooltip({ label, above = false, children }: TooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const hide = useCallback(() => setPos(null), []);
  useDismissOnEscape(pos !== null, hide);

  return (
    <span
      style={INLINE_FLEX_STYLE}
      onMouseEnter={(e) => setPos(anchorOf(e.currentTarget, above))}
      onMouseLeave={hide}
      // Focus of the wrapped control bubbles here; only keyboard focus shows
      // the tip, so a click does not leave one hanging after the pointer goes.
      onFocus={(e) => {
        if (e.target instanceof Element && e.target.matches(':focus-visible')) {
          setPos(anchorOf(e.currentTarget, above));
        }
      }}
      onBlur={hide}
    >
      {children}
      {pos &&
        createPortal(
          <TipBox role="tooltip" $x={pos.x} $y={pos.y} $above={above}>
            {label}
          </TipBox>,
          document.body,
        )}
    </span>
  );
});

// Stable identity for the span's style object so the wrapper span doesn't
// receive a new prop reference on every render of the parent.
const INLINE_FLEX_STYLE: React.CSSProperties = { display: 'inline-flex' };
