/**
 * AgentLockOverlay — soft-locks user input while the AI agent is interacting.
 *
 * Prevents race conditions during multi-step commands (overview_grid, capture_all),
 * unexpected cursor/WL jumps, and mid-paint captures. The SessionPanel pill stays
 * clickable because its z-index sits above this overlay.
 */

import { useVolumeStore } from '@/store/volumeStore';
import { Bot } from 'lucide-react';
import styled, { keyframes } from 'styled-components';

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

/** Sits just below the SessionPanel pill (which uses --z-modal = 9990). */
const Overlay = styled.output`
  position: fixed;
  inset: 0;
  z-index: 9985;
  cursor: wait;
  display: block;
  background: rgba(8, 7, 5, 0.18);
  backdrop-filter: blur(0.85px);
  animation: ${fadeIn} 160ms ease forwards;
`;

const Banner = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px 12px 16px;
  border-radius: 999px;
  border: 1px solid rgba(80, 200, 120, 0.45);
  background: rgba(14, 12, 9, 0.95);
  backdrop-filter: blur(14px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65);
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.1em;
  color: #50c878;
  white-space: nowrap;
  pointer-events: none;
`;

const Spinner = styled.span`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid rgba(80, 200, 120, 0.25);
  border-top-color: #50c878;
  animation: ${spin} 700ms linear infinite;
  flex-shrink: 0;
`;

const BotIcon = styled.span`
  display: flex;
  align-items: center;
  opacity: 0.8;
`;

const ActionText = styled.span`
  opacity: 0.7;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: lowercase;
  margin-left: 4px;
`;

export function AgentLockOverlay() {
  const sessionActive = useVolumeStore((s) => s.agentSessionActive);
  const action = useVolumeStore((s) => s.agentActivity.action);

  if (!sessionActive) return null;

  return (
    <Overlay aria-live="polite" aria-label="AI agent is interacting with the viewer">
      <Banner>
        <BotIcon>
          <Bot size={14} />
        </BotIcon>
        <Spinner />
        AI Agent Analyzing…
        {action && <ActionText>· {action}</ActionText>}
      </Banner>
    </Overlay>
  );
}
