/**
 * AnnotationHud
 *
 * Floating summary panel for AI findings — top-left corner. Two states:
 *
 *  • Collapsed → compact pill showing the count of findings + severity dot.
 *    Click to expand. Always present once at least one finding exists.
 *
 *  • Expanded → full card with left accent bar, severity, label, certainty
 *    bar, summary (capped at 5 lines with "Show more"), coordinate tags,
 *    optional size, divider, and right-aligned prev/next navigation.
 *    Auto-expands when a marker is focused (click on viewer / nav).
 *    The X button hides the expanded card AND clears the active finding.
 *    "Show more" state resets to collapsed on every annotation switch.
 */

import { SEVERITY_HEX, SEVERITY_LABEL, SEVERITY_RANK } from '@/constants';
import { useVolumeStore } from '@/store/volumeStore';
import type { AiAnnotation, SlicePlane, VolumeCursor } from '@/types';
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';

function sliceInfo(plane: SlicePlane, v: VolumeCursor): string {
  if (plane === 'coronal') return `Coronal · slice ${v.y + 1}`;
  if (plane === 'sagittal') return `Sagittal · slice ${v.x + 1}`;
  return `Axial · slice ${v.z + 1}`;
}

function orderAll(list: AiAnnotation[]): AiAnnotation[] {
  return [...list].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id),
  );
}

// ── Layout constants ────────────────────────────────────────────────────────
const SIDE_OFFSET = 30;
const TOP_OFFSET = 22;
const MOBILE_TOP = 12;
const MOBILE_SIDE = 12;

// ── Animations ──────────────────────────────────────────────────────────────

const slideDown = keyframes`
  from { transform: translateY(-8px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
`;

const popIn = keyframes`
  from { transform: scale(0.92); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
`;

const auroraSlide = keyframes`
  to { background-position: 320% 0; }
`;

// ── Expanded card — row layout: [AccentBar | Body] ──────────────────────────

const Card = styled.div`
  position: absolute;
  top: ${TOP_OFFSET}px;
  left: ${SIDE_OFFSET}px;
  z-index: var(--z-modal);
  width: 360px;
  max-width: calc(100vw - ${SIDE_OFFSET * 2}px);
  background: rgba(16, 14, 10, 0.97);
  border: 1px solid var(--rule-2);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(14px);
  font-family: var(--mono);
  overflow: hidden;
  display: flex;
  flex-direction: row;
  animation: ${slideDown} 200ms cubic-bezier(0.22, 1, 0.36, 1);

  @media (max-width: 767px) {
    width: calc(100vw - ${MOBILE_SIDE * 2}px);
    top: ${MOBILE_TOP}px;
    left: ${MOBILE_SIDE}px;
  }
`;

/** Left vertical accent stripe — full card height, severity-coloured. */
const AccentBar = styled.div<{ $color: string }>`
  width: 4px;
  flex-shrink: 0;
  background: ${({ $color }) => $color};
  border-radius: 12px 0 0 12px;
`;

const Body = styled.div`
  flex: 1;
  min-width: 0;
  padding: 13px 15px 14px;
  display: flex;
  flex-direction: column;
  gap: 9px;
`;

// ── Top row ─────────────────────────────────────────────────────────────────

const TopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
`;

const SeverityChip = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ $color }) => $color};
  border: 1px solid ${({ $color }) => `${$color}66`};
  background: ${({ $color }) => `${$color}14`};
  padding: 3px 8px;
  border-radius: 999px;
  flex-shrink: 0;
`;

const ChipDot = styled.span<{ $color: string }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
`;

const Location = styled.span`
  font-size: 9.5px;
  letter-spacing: 0.08em;
  color: var(--ink-3);
  text-transform: uppercase;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const HeaderBtn = styled.button`
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--ink-3);
  display: flex;
  align-items: center;
  flex-shrink: 0;
  &:hover { color: var(--ink); }
`;

// ── Title ────────────────────────────────────────────────────────────────────

const Title = styled.h3`
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--ink);
  line-height: 1.3;
`;

// ── Certainty bar ────────────────────────────────────────────────────────────

const CertaintyRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const CertaintyLabel = styled.span`
  font-size: 9px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-3);
  white-space: nowrap;
  flex-shrink: 0;
`;

const CertaintyTrack = styled.div`
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 999px;
  overflow: hidden;
`;

const CertaintyFill = styled.div<{ $pct: number; $color: string }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  background: ${({ $color }) => $color};
  border-radius: 999px;
  transition: width 400ms cubic-bezier(0.22, 1, 0.36, 1);
`;

const CertaintyValue = styled.span`
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ink-2);
  flex-shrink: 0;
  min-width: 28px;
  text-align: right;
`;

// ── Summary (capped at 5 lines) ──────────────────────────────────────────────

const Summary = styled.p`
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--ink-2);
`;

// ── Tag row (coords + size) ──────────────────────────────────────────────────

const TagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 1px;
`;

const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  letter-spacing: 0.07em;
  color: var(--ink-3);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 3px 7px;
  font-variant-numeric: tabular-nums;
`;

const TagKey = styled.span`
  color: var(--ink-4, var(--ink-3));
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
`;

// ── Divider + right-aligned pagination ───────────────────────────────────────

const Divider = styled.hr`
  border: none;
  border-top: 1px solid var(--rule);
  margin: 2px 0 0;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
`;

const NavBtn = styled.button`
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--rule);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--ink-2);
  cursor: pointer;
  padding: 0;
  &:hover { border-color: var(--rule-2); color: var(--ink); }
`;

const NavIndex = styled.span`
  font-size: 10.5px;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
  min-width: 34px;
  text-align: center;
`;

// ── Collapsed pill ───────────────────────────────────────────────────────────

const PillWrap = styled.div`
  position: absolute;
  top: ${TOP_OFFSET - 0.8}px;
  left: ${SIDE_OFFSET - 0.8}px;
  z-index: var(--z-modal);
  border-radius: 999px;
  padding: 1.6px;
  background: linear-gradient(110deg, #ff8a3c, #ffd24a, #7ee0c0, #7aa7ff, #c79bff, #ff8a3c);
  background-size: 320% 100%;
  animation: ${auroraSlide} 7s linear infinite;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55);
  transition: transform 160ms ease, filter 160ms ease;

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.06);
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  @media (max-width: 767px) {
    top: ${MOBILE_TOP - 0.8}px;
    left: ${MOBILE_SIDE - 0.8}px;
  }
`;

const Pill = styled.button`
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 17px 10px 14px;
  border-radius: 999px;
  border: none;
  background: linear-gradient(180deg, #171410, #100d0a);
  font-family: var(--mono);
  cursor: pointer;
  animation: ${popIn} 160ms ease;
  -webkit-tap-highlight-color: transparent;
  white-space: nowrap;
`;

const PillCount = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: #f2ece2;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
`;

const PillLabel = styled.span`
  font-size: 13px;
  color: #8e887e;
  letter-spacing: 0.14em;
`;

function SparkleIcon() {
  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
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
        style={{ filter: 'drop-shadow(0 0 5px rgba(180,160,255,.45))', flexShrink: 0 }}
        aria-hidden="true"
      />
    </>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function AnnotationHud() {
  const annotations = useVolumeStore((s) => s.aiAnnotations);
  const activeId = useVolumeStore((s) => s.activeAnnotationId);
  const focusAnnotation = useVolumeStore((s) => s.focusAnnotation);
  const setActiveAnnotation = useVolumeStore((s) => s.setActiveAnnotation);

  const [open, setOpen] = useState(false);

  // ── Auto-open when a new finding is focused ───────────────────────────
  const prevActiveId = useRef<string | null>(null);
  useEffect(() => {
    if (activeId && activeId !== prevActiveId.current) {
      setOpen(true);
    }
    prevActiveId.current = activeId;
  }, [activeId]);

  // ── Esc collapses the card ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (annotations.length === 0) return null;

  const ordered = orderAll(annotations);
  const active = activeId ? annotations.find((a) => a.id === activeId) : null;

  // ── Collapsed pill ────────────────────────────────────────────────────
  if (!open) {
    return (
      <PillWrap>
        <Pill
          type="button"
          onClick={() => {
            if (!activeId) focusAnnotation(ordered[0].id);
            setOpen(true);
          }}
          aria-label={`Show ${annotations.length} AI findings`}
        >
          <SparkleIcon />
          <PillCount>{annotations.length}</PillCount>
          <PillLabel>FINDINGS</PillLabel>
        </Pill>
      </PillWrap>
    );
  }

  // ── Expanded card ─────────────────────────────────────────────────────
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

        {/* Certainty bar */}
        {confidencePct != null && (
          <CertaintyRow>
            <CertaintyLabel>✦ Certainty</CertaintyLabel>
            <CertaintyTrack>
              <CertaintyFill $pct={confidencePct} $color={color} />
            </CertaintyTrack>
            <CertaintyValue>{confidencePct}%</CertaintyValue>
          </CertaintyRow>
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

        {/* Divider + right-aligned pagination */}
        {ordered.length > 1 && (
          <>
            <Divider />
            <Footer>
              <NavBtn type="button" aria-label="Previous finding" onClick={() => step(-1)}>
                <ChevronLeft size={15} />
              </NavBtn>
              <NavIndex>
                {idx + 1} / {ordered.length}
              </NavIndex>
              <NavBtn type="button" aria-label="Next finding" onClick={() => step(1)}>
                <ChevronRight size={15} />
              </NavBtn>
            </Footer>
          </>
        )}
      </Body>
    </Card>
  );
}
