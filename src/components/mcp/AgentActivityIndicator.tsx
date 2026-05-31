import { useVolumeStore } from '@/store/volumeStore';
import { Bot } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';

const MIN_DISPLAY_MS = 1750;
const FADE_MS = 350;

const slideIn = keyframes`
  from { opacity: 0; transform: translateY(-10px) translateX(-50%); }
  to   { opacity: 1; transform: translateY(0)      translateX(-50%); }
`;

const slideOut = keyframes`
  from { opacity: 1; transform: translateY(0)      translateX(-50%); }
  to   { opacity: 0; transform: translateY(-10px)  translateX(-50%); }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

const Pill = styled.output<{ $fading: boolean }>`
  position: fixed;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px 7px 10px;
  border-radius: 999px;
  border: 1px solid rgba(80, 200, 120, 0.4);
  background: rgba(14, 12, 9, 0.93);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.55);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: #50c878;
  pointer-events: none;
  white-space: nowrap;
  animation: ${({ $fading }) => ($fading ? slideOut : slideIn)}
    ${({ $fading }) => ($fading ? FADE_MS : 180)}ms ease forwards;

  @media (max-width: 767px) {
    top: 10px;
    font-size: 10px;
  }
`;

const Spinner = styled.span`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid rgba(80, 200, 120, 0.25);
  border-top-color: #50c878;
  animation: ${spin} 700ms linear infinite;
  flex-shrink: 0;
`;

const BotIcon = styled.span`
  display: flex;
  align-items: center;
  opacity: 0.75;
`;

export function AgentActivityIndicator() {
  const storeActive = useVolumeStore((s) => s.agentActivity.active);
  const storeAction = useVolumeStore((s) => s.agentActivity.action);

  const [mounted, setMounted] = useState(false);
  const [fading, setFading] = useState(false);
  const [label, setLabel] = useState<string | null>(null);

  const shownAt = useRef<number>(0);
  const minTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (minTimer.current) {
      clearTimeout(minTimer.current);
      minTimer.current = null;
    }
    if (fadeTimer.current) {
      clearTimeout(fadeTimer.current);
      fadeTimer.current = null;
    }
  }, []);

  const startFade = useCallback(() => {
    setFading(true);
    fadeTimer.current = setTimeout(() => {
      setMounted(false);
      setFading(false);
    }, FADE_MS);
  }, []);

  useEffect(() => {
    if (storeActive) {
      // New command — cancel any pending hide, show immediately.
      clearTimers();
      setFading(false);
      setLabel(storeAction);
      setMounted(true);
      shownAt.current = Date.now();
    } else if (mounted) {
      // Command finished — respect the minimum display time.
      const elapsed = Date.now() - shownAt.current;
      const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
      minTimer.current = setTimeout(startFade, remaining);
    }

    return clearTimers;
  }, [storeActive, storeAction, mounted, clearTimers, startFade]);

  if (!mounted) return null;

  return (
    <Pill $fading={fading} aria-live="polite">
      <BotIcon>
        <Bot size={12} />
      </BotIcon>
      <Spinner />
      {label ?? 'Agent working…'}
    </Pill>
  );
}
