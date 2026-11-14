import type { SlicePlane } from '@prisma-mri/viewer-core';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  type CSSProperties,
  type PointerEvent as RPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { PLANE_ACCENT } from '../../constants';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useViewerLabels } from '../../viewer';
import styles from './SliceScrubber.module.css';

const HOLD_DELAY_MS = 350;
const HOLD_REPEAT_MS = 50;
/** Track inset and thumb height — mirrored in SliceScrubber.module.css. */
const INSET = 4;
const THUMB_PILL_H = 16;

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

function clampSlice(n: number, total: number): number {
  return n < 1 ? 1 : n > total ? total : n;
}

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
    <button
      className={styles.chevronBtn}
      type="button"
      aria-label={label}
      onPointerDown={handleDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={stopRepeat}
      onPointerCancel={stopRepeat}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-hover={hover || undefined}
      data-pressed={pressed || undefined}
      data-reduced={reduced || undefined}
      data-large={large || undefined}
    >
      {dir === 'up' ? <ChevronUp size={large ? 14 : 11} /> : <ChevronDown size={large ? 14 : 11} />}
    </button>
  );
}

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
  const planeLabels = useViewerLabels().planes;
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
    // As a slider defines them (and the shortcut sheet says): Home is the
    // first slice, End the last.
    else if (e.key === 'Home') next = 1;
    else if (e.key === 'End') next = total;
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
    // biome-ignore lint/a11y/useKeyWithClickEvents: the handlers only stop pointer events reaching the panel; the slider inside takes the keys
    <div
      className={styles.scrubber}
      style={{ '--scrub-accent': accent } as CSSProperties}
      data-testid={`scrubber-${axis}`}
      data-visible={visible || undefined}
      data-reduced={reduced || undefined}
      data-inline={inline || undefined}
      data-large={large || undefined}
      onPointerDown={handleContainerPointerDown}
      onClick={handleContainerClick}
    >
      <ChevronButton dir="up" label="Next slice" large={large} onStep={step} />

      {/* TRACK */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={`${planeLabels[axis].name} slice`}
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
          touchAction: 'none',
        }}
      >
        {/* TICK SHEET */}
        <div className={styles.tickSheet} aria-hidden />
        {/* RAIL */}
        <div className={styles.railLine} aria-hidden />
        {/* FILL */}
        <div className={styles.fillBar} aria-hidden style={{ height: `${fillHeight}px` }} />
        {/* THUMB */}
        <div className={styles.thumbPill} aria-hidden style={{ top: `${thumbY}px` }}>
          {slice}
        </div>
      </div>

      <ChevronButton dir="down" label="Previous slice" large={large} onStep={step} />
    </div>
  );
}
