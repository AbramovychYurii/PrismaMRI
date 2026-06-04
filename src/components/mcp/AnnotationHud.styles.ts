/**
 * Styled components and keyframes for AnnotationHud.
 *
 * Two visual states share this file:
 *   • Collapsed pill (PillWrap, Pill, Specular, SparkleWrap, PillCount, PillLabel)
 *   • Expanded card (Card, AccentBar, Body, TopRow, …, Footer)
 */

import styled, { css, keyframes } from 'styled-components';

// ── Layout constants ────────────────────────────────────────────────────────

export const SIDE_OFFSET = 30;
export const TOP_OFFSET = 22;
export const MOBILE_TOP = 12;
export const MOBILE_SIDE = 12;

/** Confidence accent — neutral blue, independent of severity. */
export const CONFIDENCE_COLOR = '#60a5fa';

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

// ── Pill entrance animations ────────────────────────────────────────────────
// One-time, calm effect when findings first appear:
//   • Pill fades + glides in from slightly above — no overshoot, no blur snap.
//   • Aurora gradient ring slowly spins up to its continuous loop.
//   • A subtle specular highlight sweeps across the pill once.
//   • Sparkle icon does a single gentle scale-up.
//   • Count digits fade up softly.

const pillEntrance = keyframes`
  0%   { transform: translateY(-8px) scale(0.98); opacity: 0; }
  100% { transform: translateY(0)    scale(1);    opacity: 1; }
`;

const ringSpinUp = keyframes`
  0%   { background-position: 0% 0; }
  100% { background-position: 320% 0; }
`;

const specularSweep = keyframes`
  0%   { transform: translateX(-160%) skewX(-18deg); opacity: 0; }
  40%  { opacity: 0.3; }
  60%  { opacity: 0.3; }
  100% { transform: translateX(260%) skewX(-18deg);  opacity: 0; }
`;

const sparklePulse = keyframes`
  0%, 100% { transform: scale(1);   filter: drop-shadow(0 0 4px rgba(180,160,255,.4)); }
  50%      { transform: scale(1.1); filter: drop-shadow(0 0 8px rgba(200,180,255,.7)); }
`;

const digitTick = keyframes`
  0%   { transform: translateY(-3px); opacity: 0; }
  100% { transform: translateY(0);    opacity: 1; }
`;

// ── Expanded card — row layout: [AccentBar | Body] ──────────────────────────

export const Card = styled.div`
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
    /*
     * Constrain to available viewport: full height minus header (48px),
     * tab bar (56px), card top offset (12px) and bottom gap (12px).
     */
    max-height: calc(100dvh - 128px);
  }
`;

/** Left vertical accent stripe — full card height, severity-coloured. */
export const AccentBar = styled.div<{ $color: string }>`
  width: 4px;
  flex-shrink: 0;
  background: ${({ $color }) => $color};
  border-radius: 12px 0 0 12px;
`;

export const Body = styled.div`
  flex: 1;
  min-width: 0;
  padding: 13px 15px 14px;
  display: flex;
  flex-direction: column;
  gap: 9px;

  @media (max-width: 767px) {
    /* Allow body to scroll when card height is capped. */
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
`;

// ── Top row ─────────────────────────────────────────────────────────────────

export const TopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;

  @media (max-width: 767px) {
    position: sticky;
    top: 0;
    background: rgba(16, 14, 10, 0.97);
    z-index: 1;
    /* compensate body padding so it spans full width */
    margin: -13px -15px 0;
    padding: 13px 15px 9px;
  }
`;

export const SeverityChip = styled.span<{ $color: string }>`
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

export const ChipDot = styled.span<{ $color: string }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
`;

export const Location = styled.span`
  font-size: 9.5px;
  letter-spacing: 0.08em;
  color: var(--ink-3);
  text-transform: uppercase;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const HeaderBtn = styled.button`
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

export const Title = styled.h3`
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--ink);
  line-height: 1.3;
`;

// ── Confidence bar ───────────────────────────────────────────────────────────

export const ConfidenceRow = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
`;

export const ConfidenceLabel = styled.span`
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3);
`;

export const ConfidenceValue = styled.span`
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: ${CONFIDENCE_COLOR};
  flex-shrink: 0;
`;

// ── Summary ──────────────────────────────────────────────────────────────────

export const Summary = styled.p`
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--ink-2);
`;

// ── Tag row (coords + size) ──────────────────────────────────────────────────

export const TagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 1px;
`;

export const Tag = styled.span`
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

export const TagKey = styled.span`
  color: var(--ink-4, var(--ink-3));
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
`;

// ── Divider + right-aligned pagination ───────────────────────────────────────

export const Divider = styled.hr`
  border: none;
  border-top: 1px solid var(--rule);
  margin: 2px 0 0;
`;

export const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;

  @media (max-width: 767px) {
    position: sticky;
    bottom: 0;
    background: rgba(16, 14, 10, 0.97);
    z-index: 1;
    /* compensate body padding so it spans full width */
    margin: 0 -15px -14px;
    padding: 9px 15px 14px;
  }
`;

export const ReportBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(182, 173, 153, 0.06);
  border: 1px solid var(--ink-2);
  border-radius: 6px;
  padding: 4px 9px;
  cursor: pointer;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-2);
  transition: background 120ms, filter 120ms;
  &:hover { background: rgba(182, 173, 153, 0.12); filter: brightness(1.15); }
`;

export const HintText = styled.p`
  position: absolute;
  top: calc(${TOP_OFFSET}px + 100% + 8px);
  left: ${SIDE_OFFSET}px;
  margin: 0;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-4, var(--ink-3));
  letter-spacing: 0.06em;
  pointer-events: none;
  white-space: nowrap;

  strong {
    color: var(--ink-2);
    font-weight: 600;
    letter-spacing: 0.1em;
  }

  @media (max-width: 767px) {
    left: ${MOBILE_SIDE}px;
  }
`;

export const DismissBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 4px 9px;
  cursor: pointer;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3);
  transition: border-color 120ms, color 120ms, background 120ms;
  &:hover {
    border-color: #e05252aa;
    color: #e05252;
    background: rgba(224, 82, 82, 0.07);
  }
`;

export const NavGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

export const NavBtn = styled.button`
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

export const NavIndex = styled.span`
  font-size: 10.5px;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
  min-width: 34px;
  text-align: center;
`;

// ── Collapsed pill ───────────────────────────────────────────────────────────

export const PillWrap = styled.div<{ $entrance: boolean }>`
  position: absolute;
  top: ${TOP_OFFSET - 0.8}px;
  left: ${SIDE_OFFSET - 0.8}px;
  z-index: var(--z-modal);
  border-radius: 999px;
  padding: 1.6px;
  background: linear-gradient(110deg, #ff8a3c, #ffd24a, #7ee0c0, #7aa7ff, #c79bff, #ff8a3c);
  background-size: 320% 100%;
  /* Ring colour glide: spins up gently during entrance, then settles to the
     slow continuous loop.  Driven by two stacked animations during entrance. */
  animation:
    ${({ $entrance }) =>
      $entrance
        ? css`
            ${pillEntrance} 540ms cubic-bezier(0.22, 1, 0.36, 1) both,
            ${ringSpinUp} 1600ms cubic-bezier(0.22, 1, 0.36, 1) both,
            ${auroraSlide} 9s linear 1600ms infinite
          `
        : css`
            ${auroraSlide} 9s linear infinite
          `};
  box-shadow:
    0 4px 18px rgba(0, 0, 0, 0.55),
    0 0 ${({ $entrance }) => ($entrance ? '18px' : '0px')} rgba(150, 130, 255, 0.22);
  transition: transform 160ms ease, filter 160ms ease, box-shadow 1000ms ease 400ms;

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.06);
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55);
  }

  @media (max-width: 767px) {
    top: ${MOBILE_TOP - 0.8}px;
    left: ${MOBILE_SIDE - 0.8}px;
  }
`;

export const Pill = styled.button`
  position: relative;
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
  overflow: hidden; /* clip the specular sweep */
`;

/** Diagonal specular highlight that streaks across the pill once. */
export const Specular = styled.span<{ $entrance: boolean }>`
  pointer-events: none;
  position: absolute;
  top: -20%;
  left: 0;
  width: 38%;
  height: 140%;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.4) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  filter: blur(2px);
  opacity: 0;
  ${({ $entrance }) =>
    $entrance &&
    css`
      animation: ${specularSweep} 1100ms cubic-bezier(0.22, 1, 0.36, 1) 360ms both;
    `}

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const SparkleWrap = styled.span<{ $entrance: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transform-origin: center;
  ${({ $entrance }) =>
    $entrance &&
    css`
      animation: ${sparklePulse} 1400ms cubic-bezier(0.4, 0, 0.2, 1) 320ms both;
    `}

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const PillCount = styled.span<{ $entrance: boolean }>`
  font-size: 14px;
  font-weight: 700;
  color: #f2ece2;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  display: inline-block;
  ${({ $entrance }) =>
    $entrance &&
    css`
      animation: ${digitTick} 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
    `}

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const PillLabel = styled.span`
  font-size: 13px;
  color: #8e887e;
  letter-spacing: 0.14em;
`;
