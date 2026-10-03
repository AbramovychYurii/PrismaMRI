import { AnnotationHud } from '@/components/mcp/AnnotationHud';
import { SessionPanel } from '@/components/mcp/SessionPanel';
import { StageAlert } from '@/components/stage/StageAlert';
import { StageSeriesSelect } from '@/components/stage/StageSeriesSelect';
import { ToolbarPill } from '@/components/stage/ToolbarPill';
import { useThreePreview } from '@/hooks/useThreePreview';
import { useVolumeStore } from '@/store';
import { useEffect, useRef } from 'react';
import styled, { css } from 'styled-components';

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

/** Centred over the canvas, behind the stage chrome; never takes the pointer. */
const StageMessage = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 30px;
  text-align: center;
  pointer-events: none;
`;

const StageMessageTitle = styled.p`
  margin: 0;
  color: var(--ink-3);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
`;

/** The dock's hint style (DisplayCell's SliderHint). */
const StageMessageHint = styled.p`
  margin: 0;
  max-width: 320px;
  color: var(--ink-3);
  font-family: var(--sans);
  font-size: 11.5px;
  line-height: 1.4;
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

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { previewRef, status } = useThreePreview(canvasRef);
  const toggleToolbar = useVolumeStore((s) => s.toggleToolbar);
  const focus = useVolumeStore((s) => s.toolbar.focus);
  const hasVolume = useVolumeStore((s) => s.prepared3D !== null);

  // Focus mode is left by its own button, which is not shown without a 3-D
  // view — and the mode is kept across reloads — so leave it here instead of
  // stranding a full-window stage over the slice panels.
  useEffect(() => {
    if (status === 'unavailable' && focus) toggleToolbar('focus');
  }, [status, focus, toggleToolbar]);

  return (
    <StageSection $focus={focus} data-testid="stage-section">
      <StageCanvas ref={canvasRef} data-testid="stage-canvas" />
      {status === 'ready' && !hasVolume && (
        <NoVolumePlaceholder>No volume loaded</NoVolumePlaceholder>
      )}
      {status === 'unavailable' && (
        <StageMessage>
          <StageMessageTitle>3D view unavailable</StageMessageTitle>
          <StageMessageHint>
            This browser or device can't run WebGL 2, which the 3D view needs. The slice panels
            still work.
          </StageMessageHint>
        </StageMessage>
      )}
      {/* Always mounted, empty while the view is fine: a live region added
          together with its text is not reliably announced. */}
      <StageMessage as="output">
        {status === 'context-lost' && (
          <>
            <StageMessageTitle>3D view interrupted</StageMessageTitle>
            <StageMessageHint>
              The graphics driver was reset. The view comes back by itself once it recovers.
            </StageMessageHint>
          </>
        )}
      </StageMessage>
      <StageSeriesSelect />
      <StageAlert />
      <ToolbarPill previewRef={previewRef} has3D={status !== 'unavailable'} />
      <AnnotationHud />
      {/* Hide the AI Agent FAB in focus mode — it's part of the chrome the
          user explicitly asked to mute.  Unmounting also collapses any
          expanded panel state cleanly on re-entry. */}
      {!focus && <SessionPanel />}
    </StageSection>
  );
}
