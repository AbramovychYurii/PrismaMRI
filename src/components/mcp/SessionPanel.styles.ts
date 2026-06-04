/**
 * Styled components for SessionPanel.
 *
 * Extracted from SessionPanel.tsx so the component file focuses on the
 * connection logic and the styles can be read / iterated on independently.
 *
 * Naming + structure mirrors the layout of the panel: shell → header →
 * body sections (How it works, Capabilities, Prompt, Copy).
 */

import { DOCK_H } from '@/components/dock/Dock';
import styled, { keyframes } from 'styled-components';

// ── Shared button states ─────────────────────────────────────────────────────

export type BtnState = 'idle' | 'ok' | 'err';

// ── Animations ───────────────────────────────────────────────────────────────

const pulse = keyframes`
  0%,100% { opacity:1; }
  50%      { opacity:0.35; }
`;

const borderGlow = keyframes`
  0%,100% {
    box-shadow: 0 0 0 0 rgba(80,200,120,0), 0 4px 16px rgba(0,0,0,0.5);
    border-color: rgba(80,200,120,0.55);
  }
  50% {
    box-shadow: 0 0 10px 2px rgba(80,200,120,0.45), 0 4px 16px rgba(0,0,0,0.5);
    border-color: rgba(80,200,120,0.95);
  }
`;

// ── Shell ────────────────────────────────────────────────────────────────────

export const Panel = styled.div<{ $dockOpen: boolean }>`
  position: fixed;
  bottom: ${({ $dockOpen }) => ($dockOpen ? DOCK_H + 18 : 18)}px;
  right: 18px;
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  width: 370px;
  background: rgba(14, 12, 9, 0.97);
  border: 1px solid var(--rule);
  border-radius: 10px;
  backdrop-filter: blur(14px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65);
  overflow: hidden;
  font-family: var(--mono);
  transition: bottom 260ms ease;

  @media (max-width: 767px) {
    width: calc(100vw - 24px);
    /*
     * On mobile the MinimisedPill sits at bottom: 12px inside StageSection,
     * which itself sits above the 56 px tab bar.
     * Pill viewport-bottom ≈ 56 + 12 = 68 px; pill height ≈ 44 px.
     * Position the panel to open directly above the pill with an 8 px gap.
     */
    bottom: 120px;
    right: 12px;
  }
`;

export const PanelHeader = styled.div<{ $connected: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: ${({ $connected }) =>
    $connected ? 'rgba(80,200,120,0.06)' : 'rgba(255,255,255,0.02)'};
  border-bottom: 1px solid var(--rule);
  cursor: pointer;
  user-select: none;
  transition: background 200ms;
  &:hover {
    background: ${({ $connected }) =>
      $connected ? 'rgba(80,200,120,0.10)' : 'rgba(255,255,255,0.04)'};
  }
`;

export const StatusDot = styled.span<{ $connected: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $connected }) => ($connected ? '#50c878' : 'var(--ink-3)')};
  animation: ${({ $connected }) => ($connected ? pulse : 'none')} 2s ease-in-out infinite;
`;

export const StatusText = styled.span<{ $connected: boolean }>`
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ $connected }) => ($connected ? '#50c878' : 'var(--ink-2)')};
  flex: 1;
`;

export const HeaderIcon = styled.div`
  color: var(--ink-3);
  display: flex;
  align-items: center;
`;

export const CollapseBtn = styled.button`
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--ink-3);
  display: flex;
  align-items: center;
  &:hover { color: var(--ink); }
`;

export const PanelBody = styled.div`
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

// ── Row / value pairs ────────────────────────────────────────────────────────

export const Row = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const Label = styled.span`
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-3);
`;

export const Value = styled.span`
  font-size: 11.5px;
  letter-spacing: 0.04em;
  color: var(--ink-2);
  word-break: break-all;
`;

// ── Action buttons ───────────────────────────────────────────────────────────

export const ActionBtn = styled.button<{
  $state?: BtnState;
  $primary?: boolean;
  $danger?: boolean;
}>`
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 12px;
  border-radius: 6px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 140ms;
  width: 100%;
  justify-content: center;

  ${({ $state, $primary, $danger }) => {
    if ($state === 'ok')
      return `
        border: 1px solid var(--teal-dim);
        background: rgba(0,180,150,0.08);
        color: var(--teal);
      `;
    if ($state === 'err')
      return `
        border: 1px solid rgba(255,80,80,0.4);
        background: rgba(255,80,80,0.06);
        color: #ff6060;
      `;
    if ($primary)
      return `
        border: 1px solid rgba(80,200,120,0.35);
        background: rgba(80,200,120,0.07);
        color: #50c878;
        &:hover { background: rgba(80,200,120,0.13); border-color: rgba(80,200,120,0.6); }
      `;
    if ($danger)
      return `
        border: 1px solid rgba(255,181,71,0.35);
        background: rgba(255,181,71,0.06);
        color: var(--amber);
        &:hover { background: rgba(255,181,71,0.12); border-color: rgba(255,181,71,0.6); }
      `;
    return `
      border: 1px solid var(--rule);
      background: rgba(255,255,255,0.03);
      color: var(--ink-2);
      &:hover { border-color: var(--rule-2); color: var(--ink); }
    `;
  }}
`;

export const Hint = styled.p`
  font-size: 10px;
  color: var(--ink-3);
  line-height: 1.6;
  margin: 0;
`;

export const OpenClaudeLink = styled.a`
  color: var(--ink-2);
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-color: rgba(255,255,255,0.2);
  cursor: pointer;
  transition: color 120ms, text-decoration-color 120ms;
  &:hover {
    color: var(--ink);
    text-decoration-color: rgba(255,255,255,0.5);
  }
`;

export const Divider = styled.div`
  height: 1px;
  background: var(--rule);
  margin: 2px 0;
`;

// ── How-it-works box ─────────────────────────────────────────────────────────

export const HowItWorksBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const HowItWorksTitle = styled.span`
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-3);
`;

export const HowItWorksText = styled.p`
  margin: 0;
  font-size: 10px;
  color: var(--ink-3);
  line-height: 1.6;
`;

export const CapabilitiesToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--ink-3);
  &:hover { color: var(--ink-2); }
`;

export const CapabilityGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
`;

export const CapabilityItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding: 5px 7px;
  border-radius: 5px;
  border: 1px solid var(--rule);
  background: rgba(255,255,255,0.02);
`;

export const CapabilityDot = styled.span`
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #50c878;
  flex-shrink: 0;
  margin-top: 3px;
`;

export const CapabilityText = styled.span`
  font-size: 9px;
  color: var(--ink-3);
  line-height: 1.45;
  letter-spacing: 0.02em;
`;

// ── InfoTip ──────────────────────────────────────────────────────────────────

export const InfoBubble = styled.div<{ $x: number; $y: number }>`
  position: fixed;
  left: ${({ $x }) => $x}px;
  top: ${({ $y }) => $y}px;
  transform: translate(-100%, -50%);
  z-index: var(--z-popover);
  width: 242px;
  background: rgba(18, 16, 12, 0.97);
  border: 1px solid var(--rule-2);
  border-radius: 6px;
  padding: 8px 10px;
  font-family: var(--mono);
  font-size: 10px;
  line-height: 1.6;
  color: var(--ink-3);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.65);
  pointer-events: none;
  animation: _tip-in 80ms ease forwards;
  @keyframes _tip-in { from { opacity: 0 } to { opacity: 1 } }
`;

export const InfoBtn = styled.button`
  background: none;
  border: none;
  padding: 0;
  margin-left: 2px;
  cursor: default;
  color: var(--ink-3);
  display: inline-flex;
  align-items: center;
  line-height: 1;
  &:hover { color: var(--ink-2); }
`;

// ── Minimised pill (floating icon) ───────────────────────────────────────────

export const MinimisedPill = styled.button<{
  $connected: boolean;
  $working: boolean;
  $dockOpen: boolean;
}>`
  position: absolute;
  bottom: ${({ $dockOpen }) => ($dockOpen ? DOCK_H + 22 : 22)}px;
  right: 30px;
  z-index: var(--z-dock-ui);
  transition: bottom 260ms ease, color 120ms, background 120ms, border-color 120ms;
  display: inline-flex;
  align-items: center;
  padding: 12px;
  border-radius: 999px;
  border: 1px solid ${({ $connected, $working }) =>
    $working ? 'rgba(80,200,120,0.55)' : $connected ? 'rgba(80,200,120,0.35)' : 'var(--rule)'};
  background: ${({ $working }) => ($working ? 'rgba(14,12,9,0.97)' : 'rgba(20,18,14,0.85)')};
  backdrop-filter: blur(8px);
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ $connected }) => ($connected ? '#50c878' : 'var(--ink-2)')};
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  animation: ${({ $working }) => ($working ? borderGlow : 'none')} 2s ease-in-out infinite;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    border-color: ${({ $connected }) => ($connected ? 'rgba(80,200,120,0.6)' : 'var(--rule-2)')};
    color: ${({ $connected }) => ($connected ? '#70d898' : 'var(--ink)')};
    background: ${({ $working }) => ($working ? 'rgba(20,18,13,0.97)' : 'rgba(28,24,18,0.92)')};
  }

  @media (max-width: 767px) {
    bottom: 12px;
    right: 12px;
  }
`;

// ── Prompt-example box ───────────────────────────────────────────────────────

export const PromptBox = styled.div`
  position: relative;
  border: 1px solid var(--rule);
  border-radius: 6px;
  overflow: hidden;
`;

export const PromptLabel = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 10px 6px;
  background: rgba(255,255,255,0.02);
  border: none;
  border-bottom: 1px solid var(--rule);
  cursor: pointer;
  text-align: left;
  &:hover { background: rgba(255,255,255,0.05); }
  transition: background 120ms;
`;

export const PromptChevron = styled.span<{ $open: boolean }>`
  display: flex;
  align-items: center;
  color: var(--ink-3);
  transition: transform 200ms ease;
  transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
`;

export const PromptLabelText = styled.span`
  font-size: 9.5px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-3);
`;

export const PromptPreview = styled.pre`
  margin: 0;
  padding: 9px 10px;
  font-family: var(--mono);
  font-size: 9px;
  line-height: 1.55;
  color: var(--ink-3);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--rule-2) transparent;
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: var(--rule-2); border-radius: 2px; }
  &::-webkit-scrollbar-thumb:hover { background: var(--ink-3); }
`;

export const CopyBtn = styled.button<{ $state: BtnState }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 6px;
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  cursor: pointer;
  width: 100%;
  justify-content: center;
  transition: all 140ms;

  ${({ $state }) => {
    if ($state === 'ok')
      return `
        border: 1px solid rgba(127,209,197,0.45);
        background: rgba(127,209,197,0.07);
        color: var(--teal);
      `;
    if ($state === 'err')
      return `
        border: 1px solid rgba(255,80,80,0.35);
        background: rgba(255,80,80,0.05);
        color: #ff6060;
      `;
    return `
      border: 1px solid var(--rule);
      background: rgba(255,255,255,0.03);
      color: var(--ink-2);
      &:hover { border-color: var(--rule-2); color: var(--ink); background: rgba(255,255,255,0.05); }
    `;
  }}
`;
