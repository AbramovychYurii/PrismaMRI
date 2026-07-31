/**
 * AnnotationHud
 *
 * Floating summary panel for AI findings — top-left corner. Two states:
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
 * All styling lives in `AnnotationHud.styles.ts`.
 */

import { ReportModal } from '@/components/mcp/ReportModal';
import { AuroraSparkles } from '@/components/ui/AuroraSparkles';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { PLANE_LABEL, SEVERITY_HEX, SEVERITY_LABEL, SEVERITY_RANK } from '@/constants';
import { sliceNumber } from '@/lib/volume/plane';
import { useVolumeStore } from '@/store/volumeStore';
import type { AiAnnotation, SlicePlane, VolumeCursor } from '@/types';
import { ChevronLeft, ChevronRight, FileText, Sparkles, Trash2, X } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccentBar,
  Body,
  Card,
  ChipDot,
  ConfidenceLabel,
  ConfidenceRow,
  ConfidenceValue,
  DismissBtn,
  Divider,
  Footer,
  HeaderBtn,
  HintText,
  Location,
  NavBtn,
  NavGroup,
  NavIndex,
  Pill,
  PillCount,
  PillLabel,
  PillWrap,
  ReportBtn,
  SeverityChip,
  SparkleWrap,
  Specular,
  Summary,
  Tag,
  TagKey,
  TagRow,
  Title,
  TopRow,
} from './AnnotationHud.styles';

function sliceInfo(plane: SlicePlane, v: VolumeCursor): string {
  return `${PLANE_LABEL[plane].primary} · slice ${sliceNumber(v, plane)}`;
}

function orderAll(list: AiAnnotation[]): AiAnnotation[] {
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

export function AnnotationHud() {
  const annotations = useVolumeStore((s) => s.aiAnnotations);
  const activeId = useVolumeStore((s) => s.activeAnnotationId);
  const focusAnnotation = useVolumeStore((s) => s.focusAnnotation);
  const setActiveAnnotation = useVolumeStore((s) => s.setActiveAnnotation);
  const removeAiAnnotation = useVolumeStore((s) => s.removeAiAnnotation);

  const [open, setOpen] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [showReport, setShowReport] = useState(false);

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

  if (annotations.length === 0) return null;

  const active = activeId ? annotations.find((a) => a.id === activeId) : null;

  if (!open) {
    // `key` forces a full remount on each entrance so all keyframe
    // animations restart cleanly (avoids needing to toggle the animation
    // property by hand).
    return (
      <PillWrap key={entranceKey} $entrance={entranceActive}>
        <Pill
          type="button"
          onClick={() => {
            if (!activeId) focusAnnotation(ordered[0].id);
            setOpen(true);
          }}
          aria-label={`Show ${annotations.length} AI findings`}
        >
          <Specular aria-hidden="true" $entrance={entranceActive} />
          <SparkleWrap $entrance={entranceActive}>
            <SparkleIcon />
          </SparkleWrap>
          <PillCount $entrance={entranceActive}>{displayedCount}</PillCount>
          <PillLabel>FINDINGS</PillLabel>
        </Pill>
      </PillWrap>
    );
  }

  const shown = active ?? ordered[0];
  const color = SEVERITY_HEX[shown.severity];
  const idx = ordered.findIndex((a) => a.id === shown.id);

  const step = (delta: number) => {
    const next = (idx + delta + ordered.length) % ordered.length;
    focusAnnotation(ordered[next].id);
  };

  const confidencePct =
    shown.confidence != null ? Math.min(100, Math.max(0, shown.confidence)) : null;

  return (
    <>
      <HintText>
        Click <strong>REPORT</strong> to open the export dialog
      </HintText>
      <Card aria-label="Finding summary" aria-live="polite">
        {/* Left vertical accent bar */}
        <AccentBar $color={color} />

        <Body>
          {/* Severity chip + location + close */}
          <TopRow>
            <SeverityChip $color={color}>
              <ChipDot $color={color} />
              {SEVERITY_LABEL[shown.severity]}
            </SeverityChip>
            <Location>{sliceInfo(shown.plane, shown.voxel)}</Location>
            <HeaderBtn
              type="button"
              aria-label="Close"
              title="Close"
              onClick={() => {
                setActiveAnnotation(null);
                setOpen(false);
              }}
            >
              <X size={15} />
            </HeaderBtn>
          </TopRow>

          {/* Title */}
          <Title>{shown.label}</Title>

          {/* Confidence */}
          {confidencePct != null && (
            <ConfidenceRow>
              <AuroraSparkles size={11} strokeWidth={1.5} />
              <ConfidenceLabel>Confidence:</ConfidenceLabel>
              <ConfidenceValue>{confidencePct}%</ConfidenceValue>
            </ConfidenceRow>
          )}

          {/* Summary */}
          {shown.summary && <Summary>{shown.summary}</Summary>}

          {/* Coordinate tags + optional size */}
          <TagRow>
            <Tag>
              <TagKey>X</TagKey>
              {shown.voxel.x}
            </Tag>
            <Tag>
              <TagKey>Y</TagKey>
              {shown.voxel.y}
            </Tag>
            <Tag>
              <TagKey>Z</TagKey>
              {shown.voxel.z}
            </Tag>
            {shown.sizeMm != null && (
              <Tag>
                <TagKey>ø</TagKey>
                {shown.sizeMm} mm
              </Tag>
            )}
          </TagRow>

          {/* Divider + footer: Dismiss (left) + pagination (right) */}
          <Divider />
          <Footer>
            <NavGroup>
              <ReportBtn
                type="button"
                aria-label="Generate report"
                onClick={() => setShowReport(true)}
              >
                <FileText size={11} />
                Report
              </ReportBtn>
              <DismissBtn
                type="button"
                aria-label="Dismiss finding"
                onClick={() => setConfirmDismiss(true)}
              >
                <Trash2 size={11} />
                Dismiss
              </DismissBtn>
            </NavGroup>

            {ordered.length > 1 && (
              <NavGroup>
                <NavBtn type="button" aria-label="Previous finding" onClick={() => step(-1)}>
                  <ChevronLeft size={15} />
                </NavBtn>
                <NavIndex>
                  {idx + 1} / {ordered.length}
                </NavIndex>
                <NavBtn type="button" aria-label="Next finding" onClick={() => step(1)}>
                  <ChevronRight size={15} />
                </NavBtn>
              </NavGroup>
            )}
          </Footer>
        </Body>

        {showReport && (
          <ReportModal
            finding={shown}
            findingIndex={idx}
            allFindings={ordered}
            onClose={() => setShowReport(false)}
          />
        )}

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
              removeAiAnnotation(shown.id);
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
      </Card>
    </>
  );
}
