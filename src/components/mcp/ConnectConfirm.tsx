/**
 * ConnectConfirm
 *
 * Modal confirmation dialog shown when an MCP agent connects to the relay
 * for the first time (triggered by the 'mcp_connecting' relay message).
 *
 * The user acknowledges that an AI agent will be able to control the viewer.
 * Dismissing the dialog does NOT disconnect the agent — it simply closes the
 * popup.  The agent was admitted once it supplied the correct session UUID.
 */

import { useVolumeStore } from '@/store/volumeStore';
import { Bot, ShieldCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import styled, { keyframes } from 'styled-components';

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const slideUp = keyframes`
  from { transform: translateY(24px) scale(0.97); opacity: 0; }
  to   { transform: translateY(0)    scale(1);    opacity: 1; }
`;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-modal) + 10);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(4, 3, 2, 0.7);
  backdrop-filter: blur(4px);
  animation: ${fadeIn} 200ms ease;
`;

const Dialog = styled.div`
  width: 360px;
  max-width: calc(100vw - 32px);
  background: rgba(18, 16, 12, 0.98);
  border: 1px solid var(--rule-2);
  border-radius: 14px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
  overflow: hidden;
  animation: ${slideUp} 240ms cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: var(--mono);
`;

const DialogHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--rule);
`;

const IconWrap = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(80, 200, 120, 0.1);
  border: 1px solid rgba(80, 200, 120, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #50c878;
  flex-shrink: 0;
`;

const Title = styled.h2`
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink);
  margin: 0 0 2px;
  font-family: var(--mono);
`;

const Subtitle = styled.p`
  font-size: 10px;
  color: var(--ink-3);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin: 0;
`;

const DialogBody = styled.div`
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Capability = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 11.5px;
  color: var(--ink-2);
  line-height: 1.5;
`;

const CapIcon = styled.span`
  color: #50c878;
  flex-shrink: 0;
  margin-top: 1px;
`;

const DialogFooter = styled.div`
  padding: 14px 20px 18px;
  display: flex;
  gap: 10px;
`;

const Btn = styled.button<{ $primary?: boolean }>`
  flex: 1;
  padding: 10px 0;
  border-radius: 8px;
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 140ms;

  ${({ $primary }) =>
    $primary
      ? `
    background: rgba(80, 200, 120, 0.15);
    border: 1px solid rgba(80, 200, 120, 0.4);
    color: #50c878;
    &:hover { background: rgba(80, 200, 120, 0.22); border-color: rgba(80, 200, 120, 0.6); }
  `
      : `
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--rule);
    color: var(--ink-3);
    &:hover { background: rgba(255,255,255,0.06); color: var(--ink-2); }
  `}
`;

const CAPABILITIES = [
  'Navigate to any slice and adjust the viewing plane',
  'Modify window/level for optimal contrast',
  'Place annotation markers on suspicious areas',
  'Capture slice images for visual analysis',
];

export function ConnectConfirm({ onClose }: { onClose: () => void }) {
  const mcpConnected = useVolumeStore((s) => s.mcpConnected);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the confirm button for keyboard accessibility.
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  // Close on Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // If the agent disconnects while the dialog is open, close it.
  useEffect(() => {
    if (!mcpConnected) onClose();
  }, [mcpConnected, onClose]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: styled overlay, not a native <dialog>
    <Backdrop onClick={onClose} role="dialog" aria-modal aria-label="AI agent connection request">
      <Dialog onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <IconWrap>
            <Bot size={20} />
          </IconWrap>
          <div>
            <Title>AI Agent Connected</Title>
            <Subtitle>PrismaMRI MCP Relay</Subtitle>
          </div>
        </DialogHeader>

        <DialogBody>
          <Capability>
            <CapIcon>
              <ShieldCheck size={14} />
            </CapIcon>
            An AI agent has connected using your session ID. It can:
          </Capability>
          {CAPABILITIES.map((text) => (
            <Capability key={text}>
              <CapIcon style={{ marginTop: 2 }}>·</CapIcon>
              {text}
            </Capability>
          ))}
          <Capability style={{ color: 'var(--ink-3)', fontSize: 10.5, marginTop: 4 }}>
            <CapIcon>·</CapIcon>
            The agent cannot access your file system or other applications. Regenerate your session
            ID to disconnect it at any time.
          </Capability>
        </DialogBody>

        <DialogFooter>
          <Btn
            type="button"
            $primary
            ref={confirmRef}
            onClick={onClose}
            style={{ flex: 'none', width: '100%' }}
          >
            Got it
          </Btn>
        </DialogFooter>
      </Dialog>
    </Backdrop>
  );
}
