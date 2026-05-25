import { PLANE_ACCENT } from '@/constants';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { SlicePlane } from '@/types';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  type PointerEvent as RPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';

// ── Constants ──────────────────────────────────────────────────────────────

const PLANE_NAME: Record<SlicePlane, string> = {
  coronal: 'Coronal',
  sagittal: 'Sagittal',
  axial: 'Axial',
};

const HOLD_DELAY_MS = 350;
const HOLD_REPEAT_MS = 50;
const INSET = 4;
const THUMB_PILL_H = 16;

// ── Styled components ──────────────────────────────────────────────────────

const ChevronBtn = styled.button<{
  $hover: boolean;
  $pressed: boolean;
  $reduced: boolean;
  $large: boolean;
}>`
  width: ${({ $large }) => ($large ? '36px' : '22px')};
  height: ${({ $large }) => ($large ? '36px' : '22px')};
  flex-shrink: 0;
  border-radius: ${({ $large }) => ($large ? '6px' : '3px')};
  border: 1px solid
    ${({ $hover }) => ($hover ? 'var(--ink-4)' : 'var(--rule-2)')};
  background: ${({ $hover }) => ($hover ? 'rgba(28,24,18,0.95)' : 'rgba(15,13,10,0.85)')};
  color: ${({ $hover }) => ($hover ? 'var(--ink)' : 'var(--ink-2)')};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transform: ${({ $pressed }) => ($pressed ? 'scale(0.94)' : 'none')};
  transition: ${({ $reduced }) => ($reduced ? 'none' : 'transform 80ms ease')};

  @media (max-width: 767px) {
    width: 36px;
    height: 36px;
    border-radius: 6px;
  }
`;

const ScrubberContainer = styled.div<{
  $visible: boolean;
  $reduced: boolean;
  $inline?: boolean;
  $large?: boolean;
}>`
  position: absolute;
  top: ${({ $large }) => ($large ? '52px' : '32px')};
  right: 0;
  bottom: 0;
  width: ${({ $large }) => ($large ? '48px' : '38px')};
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px 8px 4px;
  background: linear-gradient(to left, rgba(10, 8, 5, 0.85), transparent 70%);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transform: ${({ $visible }) => ($visible ? 'translateX(0)' : 'translateX(8px)')};
  pointer-events: ${({ $visible }) => ($visible ? 'auto' : 'none')};
  transition: ${({ $reduced }) => ($reduced ? 'none' : 'opacity 160ms ease, transform 160ms ease')};

  ${({ $inline }) =>
    $inline &&
    `
    /* Inline mode: lives inside a flex column, fills available space. */
    position: relative;
    top: auto;
    right: auto;
    bottom: auto;
    flex: 1;
    min-height: 0;
    width: 100%;
    background: none;
    padding: 0;
  `}
`;

const TickSheet = styled.div`
  position: absolute;
  left: 50%;
  top: ${INSET}px;
  bottom: ${INSET}px;
  width: 12px;
  transform: translateX(-50%);
  opacity: 0.5;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    to bottom,
    var(--rule) 0,
    var(--rule) 1px,
    transparent 1px,
    transparent 6px
  );
`;

const RailLine = styled.div`
  position: absolute;
  left: 50%;
  top: ${INSET}px;
  bottom: ${INSET}px;
  width: 2px;
  transform: translateX(-50%);
  background: var(--rule);
  border-radius: 999px;
`;

const FillBar = styled.div<{ $height: number; $accent: string }>`
  position: absolute;
  left: 50%;
  bottom: ${INSET}px;
  width: 2px;
  height: ${({ $height }) => $height}px;
  transform: translateX(-50%);
  background: ${({ $accent }) => $accent};
  border-radius: 999px;
`;

const ThumbPill = styled.div<{ $top: number; $accent: string }>`
  position: absolute;
  left: 50%;
  top: ${({ $top }) => $top}px;
  width: 26px;
  height: ${THUMB_PILL_H}px;
  transform: translate(-50%, -50%);
  border-radius: 3px;
  background: color-mix(in srgb, ${({ $accent }) => $accent} 90%, transparent);
  border: 1px solid ${({ $accent }) => $accent};
  z-index: 1;
  color: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--mono);
  font-size: 9px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
`;

// ── Types ──────────────────────────────────────────────────────────────────

export interface SliceScrubberProps {
  axis: SlicePlane;
  slice: number; // 1-indexed
  total: number;
  visible: boolean;
  onChange: (next: number) => void;
  /** Render inside a flex column (mobile right rail) instead of absolute. */
  inline?: boolean;
  /** Use larger chevron buttons (36px) — for expanded/fullscreen panel. */
  large?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function clampSlice(n: number, total: number): number {
  return n < 1 ? 1 : n > total ? total : n;
}

// ── ChevronButton ──────────────────────────────────────────────────────────

function ChevronButton({
  dir,
  label,
  large,
  onStep,
}: {
  dir: 'up' | 'down';
  label: string;
  large?: boolean;
  onStep: (delta: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const delta = dir === 'up' ? 1 : -1;
  const reduced = usePrefersReducedMotion();

  const stopRepeat = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (interval.current) clearInterval(interval.current);
    timer.current = null;
    interval.current = null;
    setPressed(false);
  }, []);

  useEffect(() => stopRepeat, [stopRepeat]);

  function handleDown(e: RPointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    setPressed(true);
    onStep(delta);
    timer.current = setTimeout(() => {
      interval.current = setInterval(() => onStep(delta), HOLD_REPEAT_MS);
    }, HOLD_DELAY_MS);
  }

  const handlePointerUp = (e: RPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    stopRepeat();
  };
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation();
  const handleMouseEnter = () => setHover(true);
  const handleMouseLeave = () => setHover(false);

  return (
    <ChevronBtn
      type="button"
      aria-label={label}
      onPointerDown={handleDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={stopRepeat}
      onPointerCancel={stopRepeat}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      $hover={hover}
      $pressed={pressed}
      $reduced={reduced}
      $large={!!large}
    >
      {dir === 'up' ? <ChevronUp size={large ? 14 : 10} /> : <ChevronDown size={large ? 14 : 10} />}
    </ChevronBtn>
  );
}

// ── SliceScrubber ──────────────────────────────────────────────────────────

export function SliceScrubber({
  axis,
  slice,
  total,
  visible,
  onChange,
  inline,
  large,
}: SliceScrubberProps) {
  const accent = PLANE_ACCENT[axis];
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackH, setTrackH] = useState(0);
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const reduced = usePrefersReducedMotion();

  const measure = useCallback(() => {
    if (trackRef.current) setTrackH(trackRef.current.clientHeight);
  }, []);

  // Re-measure on mount, resize, and when toggled visible (height was 0).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `measure` is stable (useCallback), `visible` is intentional trigger
  useLayoutEffect(() => {
    measure();
  }, [measure, visible]);

  useEffect(() => {
    if (!trackRef.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const step = useCallback(
    (delta: number) => onChange(clampSlice(slice + delta, total)),
    [onChange, slice, total],
  );

  const setFromY = useCallback(
    (clientY: number) => {
      const el = trackRef.current;
      if (!el || total <= 1) return;
      const rect = el.getBoundingClientRect();
      const usable = Math.max(1, rect.height - INSET * 2);
      const y = clientY - rect.top - INSET;
      const pct = Math.max(0, Math.min(1, y / usable));
      const next = Math.round((1 - pct) * (total - 1)) + 1;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => onChange(clampSlice(next, total)));
    },
    [onChange, total],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function handleTrackDown(e: RPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.preventDefault();
    draggingRef.current = true;
    trackRef.current?.setPointerCapture?.(e.pointerId);
    setFromY(e.clientY);
  }
  function handleTrackMove(e: RPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    e.stopPropagation();
    setFromY(e.clientY);
  }
  function handleTrackUp(e: RPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    draggingRef.current = false;
    try {
      trackRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {
      /* capture may not have been acquired */
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    let next: number | null = null;
    if (e.key === 'ArrowUp') next = slice + 1;
    else if (e.key === 'ArrowDown') next = slice - 1;
    else if (e.key === 'PageUp') next = slice + 10;
    else if (e.key === 'PageDown') next = slice - 10;
    else if (e.key === 'Home') next = total;
    else if (e.key === 'End') next = 1;
    if (next !== null) {
      e.preventDefault();
      e.stopPropagation();
      onChange(clampSlice(next, total));
    }
  }

  const usable = Math.max(0, trackH - INSET * 2);
  const pct = total > 1 ? (slice - 1) / (total - 1) : 0;
  const halfPill = THUMB_PILL_H / 2;
  const thumbYRaw = INSET + (1 - pct) * usable;
  const thumbY = Math.max(halfPill, Math.min(trackH - halfPill, thumbYRaw));
  const fillHeight = pct * usable;

  const handleContainerPointerDown = (e: RPointerEvent<HTMLDivElement>) => e.stopPropagation();
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation();

  return (
    <ScrubberContainer
      $visible={visible}
      $reduced={reduced}
      $inline={inline}
      $large={large}
      onPointerDown={handleContainerPointerDown}
      onClick={handleContainerClick}
    >
      <ChevronButton dir="up" label="Next slice" large={large} onStep={step} />

      {/* TRACK */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={`${PLANE_NAME[axis]} slice`}
        aria-orientation="vertical"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={slice}
        onPointerDown={handleTrackDown}
        onPointerMove={handleTrackMove}
        onPointerUp={handleTrackUp}
        onPointerCancel={handleTrackUp}
        onKeyDown={handleKey}
        style={{
          flex: 1,
          width: '100%',
          position: 'relative',
          cursor: 'ns-resize',
          padding: `${INSET}px 0`,
          outline: 'none',
          touchAction: 'none',
        }}
      >
        {/* TICK SHEET */}
        <TickSheet aria-hidden />
        {/* RAIL */}
        <RailLine aria-hidden />
        {/* FILL */}
        <FillBar aria-hidden $height={fillHeight} $accent={accent} />
        {/* THUMB */}
        <ThumbPill aria-hidden $top={thumbY} $accent={accent}>
          {slice}
        </ThumbPill>
      </div>

      <ChevronButton dir="down" label="Previous slice" large={large} onStep={step} />
    </ScrubberContainer>
  );
}
