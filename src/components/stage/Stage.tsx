import { useRef } from "react";
import styled, { css } from "styled-components";
import { useThreePreview } from "@/hooks";
import { useVolumeStore } from "@/store";
import { RegistrationMarks } from "@/components/stage/RegistrationMarks";
import { ToolbarPill } from "@/components/stage/ToolbarPill";
import { TickScale } from "@/components/stage/TickScale";

// ── Styled components ──────────────────────────────────────────────────────

const focusedStyles = css`
  position: fixed;
  inset: 0;
  z-index: 40;
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
  color: var(--ink-4);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  pointer-events: none;
`;

const TitleGroup = styled.div`
  position: absolute;
  top: 22px;
  left: 30px;
  display: flex;
  align-items: flex-end;
  gap: 16px;
  max-width: calc(100% - 420px);
  min-width: 0;
`;

const VolumeTitle = styled.div`
  font-family: var(--serif);
  font-size: 22px;
  line-height: 1;
  font-weight: 400;
  letter-spacing: -0.005em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const VolumeSubLabel = styled.div`
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--ink-3);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding-bottom: 4px;
`;

// ── Component ──────────────────────────────────────────────────────────────

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useThreePreview(canvasRef);
  const focus = useVolumeStore((s) => s.toolbar.focus);
  const hasVolume = useVolumeStore((s) => s.prepared3D !== null);

  return (
    <StageSection $focus={focus}>
      <StageCanvas ref={canvasRef} />
      {!hasVolume && (
        <NoVolumePlaceholder>No volume loaded</NoVolumePlaceholder>
      )}
      <RegistrationMarks />
      <TitleGroup>
        <VolumeTitle>Main volume</VolumeTitle>
        <VolumeSubLabel>Ray-cast · native res</VolumeSubLabel>
      </TitleGroup>
      <ToolbarPill />
      <TickScale />
    </StageSection>
  );
}
