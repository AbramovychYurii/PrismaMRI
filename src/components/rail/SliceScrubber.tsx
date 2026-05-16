import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
} from 'react';
import type { SlicePlane } from '@/types';

const ACCENT: Record<SlicePlane, string> = {
  coronal: 'var(--amber)',
  sagittal: 'var(--violet)',
  axial: 'var(--azure)',
};

const PLANE_NAME: Record<SlicePlane, string> = {
  coronal: 'Coronal',
  sagittal: 'Sagittal',
  axial: 'Axial',
};

const HOLD_DELAY_MS = 350;
const HOLD_REPEAT_MS = 50;
const INSET = 4;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

export interface SliceScrubberProps {
  axis: SlicePlane;
  slice: number; // 1-indexed
  total: number;
  visible: boolean;
  onChange: (next: number) => void;
}

function clampSlice(n: number, total: number): number {
  return n < 1 ? 1 : n > total ? total : n;
}

function ChevronButton({
  dir,
  label,
  onStep,
}: {
  dir: 'up' | 'down';
  label: string;
  onStep: (delta: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const delta = dir === 'up' ? -1 : 1;

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

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={handleDown}
      onPointerUp={(e) => {
        e.stopPropagation();
        stopRepeat();
      }}
      onPointerLeave={stopRepeat}
      onPointerCancel={stopRepeat}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 22,
        height: 22,
        flexShrink: 0,
        borderRadius: 3,
        border: `1px solid ${hover ? 'var(--ink-4)' : 'var(--rule-2)'}`,
        background: hover ? 'rgba(28,24,18,0.95)' : 'rgba(15,13,10,0.85)',
        color: hover ? 'var(--ink)' : 'var(--ink-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        transform: pressed ? 'scale(0.94)' : 'none',
        transition: prefersReducedMotion() ? 'none' : 'transform 80ms ease',
      }}
    >
      <svg
        width={10}
        height={10}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {dir === 'up' ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
    </button>
  );
}

export function SliceScrubber({
  axis,
  slice,
  total,
  visible,
  onChange,
}: SliceScrubberProps) {
  const accent = ACCENT[axis];
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackH, setTrackH] = useState(0);
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const reduced = prefersReducedMotion();

  const measure = useCallback(() => {
    if (trackRef.current) setTrackH(trackRef.current.clientHeight);
  }, []);

  // Re-measure on mount, resize, and when toggled visible (height was 0).
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
      const next = Math.round(pct * (total - 1)) + 1;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() =>
        onChange(clampSlice(next, total)),
      );
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
    if (e.key === 'ArrowUp') next = slice - 1;
    else if (e.key === 'ArrowDown') next = slice + 1;
    else if (e.key === 'PageUp') next = slice - 10;
    else if (e.key === 'PageDown') next = slice + 10;
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
  const thumbY = INSET + pct * usable;
  const fillHeight = pct * usable;

  const containerStyle: CSSProperties = {
    position: 'absolute',
    top: 32,
    right: 0,
    bottom: 0,
    width: 38,
    zIndex: 5,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '8px 6px 8px 4px',
    background:
      'linear-gradient(to left, rgba(10,8,5,0.85), transparent 70%)',
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateX(0)' : 'translateX(8px)',
    pointerEvents: visible ? 'auto' : 'none',
    transition: reduced
      ? 'none'
      : 'opacity 160ms ease, transform 160ms ease',
  };

  return (
    <div
      style={containerStyle}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <ChevronButton dir="up" label="Previous slice" onStep={step} />

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
        {/* c. TICK SHEET */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: INSET,
            bottom: INSET,
            width: 12,
            transform: 'translateX(-50%)',
            opacity: 0.5,
            pointerEvents: 'none',
            backgroundImage:
              'repeating-linear-gradient(to bottom, var(--rule) 0, var(--rule) 1px, transparent 1px, transparent 6px)',
          }}
        />
        {/* a. RAIL */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: INSET,
            bottom: INSET,
            width: 2,
            transform: 'translateX(-50%)',
            background: 'var(--rule)',
            borderRadius: 999,
          }}
        />
        {/* b. FILL */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: INSET,
            width: 2,
            height: fillHeight,
            transform: 'translateX(-50%)',
            background: accent,
            borderRadius: 999,
          }}
        />
        {/* d. THUMB */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: thumbY,
            width: 26,
            height: 16,
            transform: 'translate(-50%, -50%)',
            borderRadius: 3,
            background: 'rgba(28,24,18,0.95)',
            border: `1px solid ${accent}`,
            color: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 9,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: -3,
              right: -3,
              top: '50%',
              borderTop: '1px solid currentColor',
              opacity: 0.6,
            }}
          />
          {slice}
        </div>
      </div>

      <ChevronButton dir="down" label="Next slice" onStep={step} />
    </div>
  );
}

export function SliceScrubberToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  const [hover, setHover] = useState(false);
  const border = active
    ? 'var(--amber-dim)'
    : hover
      ? 'var(--rule-2)'
      : 'var(--rule)';
  const color = active ? 'var(--amber)' : hover ? 'var(--ink)' : 'var(--ink-3)';
  return (
    <button
      type="button"
      aria-label="Toggle slice scrubber"
      aria-pressed={active}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 22,
        height: 22,
        flexShrink: 0,
        borderRadius: 3,
        border: `1px solid ${border}`,
        background: active ? 'rgba(255,181,71,0.08)' : 'transparent',
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <svg
        width={11}
        height={11}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 9l4-4 4 4" />
        <path d="M8 15l4 4 4-4" />
      </svg>
    </button>
  );
}
