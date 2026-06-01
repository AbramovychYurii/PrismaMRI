/**
 * AnnotationHud
 *
 * Floating summary panel for AI findings — top-left corner. Two states:
 *
 *  • Collapsed → compact pill showing the count of findings + severity dot.
 *    Click to expand. Always present once at least one finding exists.
 *
 *  • Expanded → full card with the currently focused finding's severity,
 *    label, 1–3 sentence summary, location and prev/next navigation.
 *    Auto-expands when a marker is focused (click on viewer / nav).
 *    The X button hides the expanded card AND clears the active finding;
 *    the collapsed pill stays visible so the user can reopen it.
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
// Rendered INSIDE <StageSection> (position: relative), so offsets are local to
// the stage container — mirrors the ToolbarPill (top:22 / right:30) on the
// opposite corner so both stage pills share the exact same visual weight.
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

const rainbowSpin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

// ── Expanded card ───────────────────────────────────────────────────────────

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
  animation: ${slideDown} 200ms cubic-bezier(0.22, 1, 0.36, 1);

  @media (max-width: 767px) {
    width: calc(100vw - ${MOBILE_SIDE * 2}px);
    top: ${MOBILE_TOP}px;
    left: ${MOBILE_SIDE}px;
  }
`;

const AccentStripe = styled.div<{ $color: string }>`
  height: 3px;
  background: ${({ $color }) => $color};
`;

const Body = styled.div`
  padding: 13px 15px 14px;
  display: flex;
  flex-direction: column;
  gap: 9px;
`;

const TopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
`;

const Chip = styled.span<{ $color: string }>`
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

const Title = styled.h3`
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--ink);
  line-height: 1.35;
`;

const Summary = styled.p`
  margin: 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--ink-2);
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2px;
`;

const NavGroup = styled.div`
  display: flex;
  align-items: center;
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

const Index = styled.span`
  font-size: 10.5px;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
  min-width: 34px;
  text-align: center;
`;

// ── Collapsed pill ──────────────────────────────────────────────────────────

const PillWrap = styled.div`
  position: absolute;
  /* Offset by half a pixel so the pill inside the 0.5 px padding ring lands
     at the same visual edge as the ToolbarPill on the opposite corner. */
  top: ${TOP_OFFSET - 0.5}px;
  left: ${SIDE_OFFSET - 0.5}px;
  z-index: var(--z-modal);
  border-radius: 999px;
  padding: 0.5px;
  isolation: isolate;
  overflow: hidden;
  animation: ${popIn} 160ms ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);

  /* Full rainbow border that slowly rotates around the pill — signals an AI
     feature. The inner dark mask (::after) hides the centre so only a thin
     ring is visible; the whole ring is always coloured, the colours just
     drift around the perimeter. */
  &::before {
    content: '';
    position: absolute;
    /* Disc larger than the wrap so colours don't compress at the corners. */
    inset: -150%;
    background: conic-gradient(
      from 0deg,
      #ff5e8a,
      #ffb547,
      #50c878,
      #4ec5ff,
      #b780ff,
      #ff5e8a
    );
    animation: ${rainbowSpin} 6s linear infinite;
    z-index: -1;
  }

  &::after {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: 999px;
    background: rgba(14, 12, 9, 0.95);
    z-index: -1;
  }

  @media (max-width: 767px) {
    top: ${MOBILE_TOP - 0.5}px;
    left: ${MOBILE_SIDE - 0.5}px;
  }
`;

const Pill = styled.button`
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  /* Mirrors the ToolbarPill ToolBtn sizing on the opposite stage corner. */
  padding: 12px 14px;
  border-radius: 999px;
  border: none;
  background: transparent;
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-2);
  cursor: pointer;
  transition: color 120ms;

  &:hover {
    color: var(--ink);
  }
`;

const PillIcon = styled.span`
  display: flex;
  align-items: center;
`;

const PillCount = styled.span`
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: 0.04em;
`;

const PillLabel = styled.span`
  opacity: 0.65;
`;

// ── Component ───────────────────────────────────────────────────────────────

export function AnnotationHud() {
  // No view-gate needed — this component renders inside <StageSection>, which
  // itself is only mounted in the viewer view.
  const annotations = useVolumeStore((s) => s.aiAnnotations);
  const activeId = useVolumeStore((s) => s.activeAnnotationId);
  const focusAnnotation = useVolumeStore((s) => s.focusAnnotation);
  const setActiveAnnotation = useVolumeStore((s) => s.setActiveAnnotation);

  const [open, setOpen] = useState(false);

  // Auto-open when a finding becomes active (click on marker, nav button, etc.)
  const prevActiveId = useRef<string | null>(null);
  useEffect(() => {
    if (activeId && activeId !== prevActiveId.current) {
      setOpen(true);
    }
    prevActiveId.current = activeId;
  }, [activeId]);

  // Esc collapses the card (without clearing the active finding).
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
        {/* Inline SVG defs — referenced by the Sparkles stroke below. */}
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <defs>
            <linearGradient id="ai-rainbow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff5e8a" />
              <stop offset="25%" stopColor="#ffb547" />
              <stop offset="50%" stopColor="#50c878" />
              <stop offset="75%" stopColor="#4ec5ff" />
              <stop offset="100%" stopColor="#b780ff" />
            </linearGradient>
          </defs>
        </svg>
        <Pill
          type="button"
          onClick={() => {
            // If no active finding yet, focus the most severe one.
            if (!activeId) focusAnnotation(ordered[0].id);
            setOpen(true);
          }}
          aria-label={`Show ${annotations.length} AI findings`}
        >
          <PillIcon>
            <Sparkles size={18} stroke="url(#ai-rainbow)" />
          </PillIcon>
          <PillCount>{annotations.length}</PillCount>
          <PillLabel>{annotations.length === 1 ? 'finding' : 'findings'}</PillLabel>
        </Pill>
      </PillWrap>
    );
  }

  // ── Expanded card ─────────────────────────────────────────────────────
  // If somehow open but nothing active, fall back to the most severe.
  const shown = active ?? ordered[0];
  const color = SEVERITY_HEX[shown.severity];
  const idx = ordered.findIndex((a) => a.id === shown.id);

  const step = (delta: number) => {
    const next = (idx + delta + ordered.length) % ordered.length;
    focusAnnotation(ordered[next].id);
  };

  return (
    <Card aria-label="Finding summary" aria-live="polite">
      <AccentStripe $color={color} />
      <Body>
        <TopRow>
          <Chip $color={color}>
            <ChipDot $color={color} />
            {SEVERITY_LABEL[shown.severity]}
          </Chip>
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

        <Title>{shown.label}</Title>
        {shown.summary && <Summary>{shown.summary}</Summary>}

        {ordered.length > 1 && (
          <Footer>
            <NavGroup>
              <NavBtn type="button" aria-label="Previous finding" onClick={() => step(-1)}>
                <ChevronLeft size={15} />
              </NavBtn>
              <Index>
                {idx + 1} / {ordered.length}
              </Index>
              <NavBtn type="button" aria-label="Next finding" onClick={() => step(1)}>
                <ChevronRight size={15} />
              </NavBtn>
            </NavGroup>
          </Footer>
        )}
      </Body>
    </Card>
  );
}
