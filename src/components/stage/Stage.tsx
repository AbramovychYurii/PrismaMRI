import { AnnotationHud } from '@/components/mcp/AnnotationHud';
import { SessionPanel } from '@/components/mcp/SessionPanel';
import { ToolbarPill } from '@/components/stage/ToolbarPill';
import { useThreePreview } from '@/hooks';
import { useVolumeStore } from '@/store';
import { useRef } from 'react';
import styled, { css } from 'styled-components';

// ── Styled components ──────────────────────────────────────────────────────

const focusedStyles = css`
  position: fixed;
  inset: 0;
  z-index: var(--z-stage);
  background: radial-gradient(
    ellipse at 50% 55%,
    rgba(28, 26, 20, 0.7) 0%,
    rgba(8, 7, 5, 0.97) 80%
  );
  overflow: hidden;
`;

const normalStyles = css`
  grid-area: stage;
  position: relative;
  background: radial-gradient(
    ellipse at 50% 55%,
    rgba(28, 26, 20, 0.7) 0%,
    rgba(8, 7, 5, 0.97) 80%
  );
  overflow: hidden;
  border-right: 1px solid var(--rule);

  @media (max-width: 767px) {
    /* StageWrap is position:absolute;inset:0 — child needs explicit height to fill it. */
    height: 100%;
    border-right: none;
  }
`;

const StageSection = styled.section<{ $focus: boolean }>`
  ${({ $focus }) => ($focus ? focusedStyles : normalStyles)}
`;

const StageCanvas = styled.canvas`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
`;

const NoVolumePlaceholder = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  pointer-events: none;
`;

// ── Component ──────────────────────────────────────────────────────────────

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useThreePreview(canvasRef);
  const focus = useVolumeStore((s) => s.toolbar.focus);
  const hasVolume = useVolumeStore((s) => s.prepared3D !== null);

  return (
    <StageSection $focus={focus} data-testid="stage-section">
      <StageCanvas ref={canvasRef} data-testid="stage-canvas" />
      {!hasVolume && <NoVolumePlaceholder>No volume loaded</NoVolumePlaceholder>}
      <ToolbarPill previewRef={previewRef} />
      <AnnotationHud />
      {/* Hide the AI Agent FAB in focus mode — it's part of the chrome the
          user explicitly asked to mute.  Unmounting also collapses any
          expanded panel state cleanly on re-entry. */}
      {!focus && <SessionPanel />}
    </StageSection>
  );
}
