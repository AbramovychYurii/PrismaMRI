/**
 * AnnotationHud
 *
 * Floating summary panel for findings — top-left corner. Two states:
 *
 *  • Collapsed → compact pill showing the count of findings + severity dot.
 *    Click to expand. Always present once at least one finding exists.
 *
 *  • Expanded → full card with left accent bar, severity, label, confidence
 *    bar, summary (capped at 5 lines with "Show more"), coordinate tags,
 *    optional size, divider, and right-aligned prev/next navigation.
 *    Auto-expands when a marker is focused (click on viewer / nav).
 *    The X button hides the expanded card AND clears the active finding.
 *
 * The host adds its own footer actions (PrismaMRI: the PDF report) and the
 * hint line under the card through `slots.annotationActions` / `annotationHint`.
 *
 * All styling lives in `AnnotationHud.module.css`.
 */

import { AuroraSparkles } from '@/components/ui/AuroraSparkles';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { SEVERITY_RANK } from '@/constants';
import { sliceNumber } from '@/lib/volume/plane';
import type { Annotation, SlicePlane, VolumeCursor } from '@/types';
import {
  useViewerFeatures,
  useViewerHost,
  useViewerLabels,
  useViewerStore,
  useViewerTheme,
} from '@/viewer';
import { ChevronLeft, ChevronRight, Sparkles, Trash2, X } from 'lucide-react';
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styles from './AnnotationHud.module.css';

function sliceInfo(planeName: string, plane: SlicePlane, v: VolumeCursor): string {
  return `${planeName} · slice ${sliceNumber(v, plane)}`;
}

function orderAll(list: Annotation[]): Annotation[] {
  return [...list].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id),
  );
}

const SPARKLE_ICON_STYLE: React.CSSProperties = {
  filter: 'drop-shadow(0 0 5px rgba(180,160,255,.45))',
  flexShrink: 0,
};

const SPARKLE_GRADIENT_DEFS_STYLE: React.CSSProperties = { position: 'absolute' };

const SparkleIcon = memo(function SparkleIcon() {
  return (
    <>
      <svg width="0" height="0" style={SPARKLE_GRADIENT_DEFS_STYLE} aria-hidden="true">
        <defs>
          <linearGradient id="hud-sparkle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff8a3c" />
            <stop offset="25%" stopColor="#ffd24a" />
            <stop offset="50%" stopColor="#7ee0c0" />
            <stop offset="75%" stopColor="#7aa7ff" />
            <stop offset="100%" stopColor="#c79bff" />
          </linearGradient>
        </defs>
      </svg>
      <Sparkles
        size={22}
        stroke="url(#hud-sparkle-grad)"
        strokeWidth={1.75}
        style={SPARKLE_ICON_STYLE}
        aria-hidden="true"
      />
    </>
  );
});

/** Duration of the pill entrance animation in ms — keep in sync with the keyframes. */
const ENTRANCE_DURATION_MS = 1400;
/** Count-up easing duration when the pill first appears, in ms. */
const COUNT_UP_DURATION_MS = 520;

/**
 * A footer button styled like the card's own — for the actions a host adds
 * through `slots.annotationActions`.
 */
export function AnnotationActionButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={className ? `${styles.actionBtn} ${className}` : styles.actionBtn}
    />
  );
}

export function AnnotationHud() {
  const annotations = useViewerStore((s) => s.annotations);
  const activeId = useViewerStore((s) => s.activeAnnotationId);
  const focusAnnotation = useViewerStore((s) => s.focusAnnotation);
  const setActiveAnnotation = useViewerStore((s) => s.setActiveAnnotation);
  const removeAnnotation = useViewerStore((s) => s.removeAnnotation);

  const [open, setOpen] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const { slots } = useViewerHost();
  const theme = useViewerTheme();
  const labels = useViewerLabels();
  const { annotations: enabled } = useViewerFeatures();

  // The pill plays its full multi-layer entrance only the first time it
  // appears for a given run.  Subsequent re-renders (collapse/expand,
  // annotation count changes) reuse the static look + continuous ring slide.
  // `entranceKey` is bumped when the pill transitions from "no findings"
  // → "≥1 finding" so each batch of new findings re-triggers the animation.
  const [entranceKey, setEntranceKey] = useState(0);
  const [entranceActive, setEntranceActive] = useState(false);
  const hadFindingsRef = useRef(false);
  const reduceMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const has = annotations.length > 0;
    if (has && !hadFindingsRef.current) {
      setEntranceKey((k) => k + 1);
      setEntranceActive(true);
      const t = setTimeout(() => setEntranceActive(false), ENTRANCE_DURATION_MS);
      hadFindingsRef.current = true;
      return () => clearTimeout(t);
    }
    if (!has) hadFindingsRef.current = false;
  }, [annotations.length]);

  const [displayedCount, setDisplayedCount] = useState(annotations.length);
  useEffect(() => {
    if (!entranceActive || reduceMotion.current) {
      setDisplayedCount(annotations.length);
      return;
    }
    const target = annotations.length;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_UP_DURATION_MS);
      // easeOutCubic
      const eased = 1 - (1 - t) ** 3;
      setDisplayedCount(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [entranceActive, annotations.length]);

  const prevActiveId = useRef<string | null>(null);
  useEffect(() => {
    if (activeId && activeId !== prevActiveId.current) {
      setOpen(true);
    }
    prevActiveId.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Memoise the severity-sorted list — orderAll allocates an array and runs an
  // O(n log n) sort. Recompute only when the underlying findings change.
  const ordered = useMemo(() => orderAll(annotations), [annotations]);

  if (!enabled || annotations.length === 0) return null;

  const active = activeId ? annotations.find((a) => a.id === activeId) : null;

  if (!open) {
    // `key` forces a full remount on each entrance so all keyframe
    // animations restart cleanly (avoids needing to toggle the animation
    // property by hand).
    return (
      <div
        className={styles.pillWrap}
        key={entranceKey}
        data-entrance={entranceActive || undefined}
      >
        <button
          className={styles.pill}
          type="button"
          onClick={() => {
            if (!activeId) focusAnnotation(ordered[0].id);
            setOpen(true);
          }}
          aria-label={`Show ${annotations.length} AI findings`}
        >
          <span
            className={styles.specular}
            aria-hidden="true"
            data-entrance={entranceActive || undefined}
          />
          <span className={styles.sparkleWrap} data-entrance={entranceActive || undefined}>
            <SparkleIcon />
          </span>
          <span className={styles.pillCount} data-entrance={entranceActive || undefined}>
            {displayedCount}
          </span>
          <span className={styles.pillLabel}>FINDINGS</span>
        </button>
      </div>
    );
  }

  const shown = active ?? ordered[0];
  const color = theme.severity[shown.severity];
  const idx = ordered.findIndex((a) => a.id === shown.id);

  const step = (delta: number) => {
    const next = (idx + delta + ordered.length) % ordered.length;
    focusAnnotation(ordered[next].id);
  };

  const confidencePct =
    shown.confidence != null ? Math.min(100, Math.max(0, shown.confidence)) : null;

  return (
    <>
      {slots.annotationHint && <p className={styles.hintText}>{slots.annotationHint}</p>}
      <div
        className={styles.card}
        style={{ '--sev-color': color } as CSSProperties}
        aria-label="Finding summary"
        aria-live="polite"
      >
        {/* Left vertical accent bar */}
        <div className={styles.accentBar} />

        <div className={styles.body}>
          {/* Severity chip + location + close */}
          <div className={styles.topRow}>
            <span className={styles.severityChip}>
              <span className={styles.chipDot} />
              {labels.severity[shown.severity]}
            </span>
            <span className={styles.location}>
              {sliceInfo(labels.planes[shown.plane].name, shown.plane, shown.voxel)}
            </span>
            <button
              className={styles.headerBtn}
              type="button"
              aria-label="Close"
              title="Close"
              onClick={() => {
                setActiveAnnotation(null);
                setOpen(false);
              }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Title */}
          <h3 className={styles.title}>{shown.label}</h3>

          {/* Confidence */}
          {confidencePct != null && (
            <div className={styles.confidenceRow}>
              <AuroraSparkles size={11} strokeWidth={1.5} />
              <span className={styles.confidenceLabel}>Confidence:</span>
              <span className={styles.confidenceValue}>{confidencePct}%</span>
            </div>
          )}

          {/* Summary */}
          {shown.summary && <p className={styles.summary}>{shown.summary}</p>}

          {/* Coordinate tags + optional size */}
          <div className={styles.tagRow}>
            <span className={styles.tag}>
              <span className={styles.tagKey}>X</span>
              {shown.voxel.x}
            </span>
            <span className={styles.tag}>
              <span className={styles.tagKey}>Y</span>
              {shown.voxel.y}
            </span>
            <span className={styles.tag}>
              <span className={styles.tagKey}>Z</span>
              {shown.voxel.z}
            </span>
            {shown.sizeMm != null && (
              <span className={styles.tag}>
                <span className={styles.tagKey}>ø</span>
                {shown.sizeMm} mm
              </span>
            )}
          </div>

          {/* Divider + footer: Dismiss (left) + pagination (right) */}
          <hr className={styles.divider} />
          <div className={styles.footer}>
            <div className={styles.navGroup}>
              {slots.annotationActions?.({ finding: shown, index: idx, all: ordered })}
              <button
                className={styles.dismissBtn}
                type="button"
                aria-label="Dismiss finding"
                onClick={() => setConfirmDismiss(true)}
              >
                <Trash2 size={11} />
                Dismiss
              </button>
            </div>

            {ordered.length > 1 && (
              <div className={styles.navGroup}>
                <button
                  className={styles.navBtn}
                  type="button"
                  aria-label="Previous finding"
                  onClick={() => step(-1)}
                >
                  <ChevronLeft size={15} />
                </button>
                <span className={styles.navIndex}>
                  {idx + 1} / {ordered.length}
                </span>
                <button
                  className={styles.navBtn}
                  type="button"
                  aria-label="Next finding"
                  onClick={() => step(1)}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        </div>

        {confirmDismiss && (
          <ConfirmModal
            title="Remove finding?"
            message={`"${shown.label}" will be permanently removed from the viewer.`}
            confirmLabel="Dismiss"
            cancelLabel="Keep"
            danger
            onCancel={() => setConfirmDismiss(false)}
            onConfirm={() => {
              setConfirmDismiss(false);
              const nextIdx = ordered.length > 1 ? (idx + 1) % ordered.length : -1;
              removeAnnotation(shown.id);
              if (nextIdx >= 0) {
                const neighbour = ordered[nextIdx === ordered.length - 1 ? idx - 1 : nextIdx];
                if (neighbour && neighbour.id !== shown.id) focusAnnotation(neighbour.id);
              } else {
                setActiveAnnotation(null);
                setOpen(false);
              }
            }}
          />
        )}
      </div>
    </>
  );
}
