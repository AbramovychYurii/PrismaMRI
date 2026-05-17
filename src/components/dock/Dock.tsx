import { useState, type ReactNode } from "react";
import styled from "styled-components";
import { ChevronDown } from "lucide-react";
import { useVolumeStore } from "@/store";
import { DisplayCell } from "@/components/dock/DisplayCell";
import { StudyCell } from "@/components/dock/StudyCell";
import { NavigationCell } from "@/components/dock/NavigationCell";
import { SessionCell } from "@/components/dock/SessionCell";

const DOCK_H = 200;

function prefersReduced() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

// ── Styled components ──────────────────────────────────────────────────────

const HeadLine = styled.span`
  flex: 1;
  height: 1px;
  background: var(--rule);
`;

const HeadTitle = styled.span`
  font-family: var(--serif);
  font-style: italic;
  font-size: 15px;
  color: var(--ink);
  letter-spacing: 0.005em;
`;

const StyledCellHead = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
`;

const StyledDockCell = styled.div<{ $last?: boolean }>`
  padding: 14px 22px 16px;
  border-right: ${({ $last }) => ($last ? "none" : "1px solid var(--rule)")};
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const ToggleButton = styled.button<{
  $open: boolean;
  $hover: boolean;
  $reduced: boolean;
}>`
  position: fixed;
  bottom: ${({ $open }) => ($open ? DOCK_H + 10 : 10)}px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  transition: ${({ $reduced }) =>
    $reduced
      ? "none"
      : "bottom 260ms ease, background 100ms, border-color 100ms"};
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: ${({ $hover }) =>
    $hover ? "rgba(28,22,14,0.97)" : "rgba(15,12,8,0.88)"};
  border: 1px solid
    ${({ $hover }) => ($hover ? "var(--amber)" : "var(--amber-dim)")};
  border-radius: 50%;
  color: ${({ $hover }) => ($hover ? "var(--amber)" : "var(--ink-3)")};
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);
`;

const ChevronWrap = styled.span<{ $open: boolean; $reduced: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  transform: ${({ $open }) => ($open ? "rotate(0deg)" : "rotate(180deg)")};
  transition: ${({ $reduced }) => ($reduced ? "none" : "transform 260ms ease")};
`;

const DockPanel = styled.div<{ $open: boolean; $reduced: boolean }>`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: ${DOCK_H}px;
  transform: ${({ $open }) =>
    $open ? "translateY(0)" : `translateY(${DOCK_H}px)`};
  transition: ${({ $reduced }) => ($reduced ? "none" : "transform 260ms ease")};
  z-index: 15;
  background: var(--panel);
  border-top: 1px solid var(--rule);
  display: grid;
  grid-template-columns: 1.1fr 1.4fr 1fr 0.9fr;
  align-items: stretch;
  padding-bottom: 12px;
`;

// ── Sub-components ─────────────────────────────────────────────────────────

function CellHead({ title }: { title: string }) {
  return (
    <StyledCellHead>
      <HeadTitle>{title}</HeadTitle>
      <HeadLine />
    </StyledCellHead>
  );
}

function DockCell({
  title,
  children,
  last,
}: {
  title: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <StyledDockCell $last={last}>
      <CellHead title={title} />
      {children}
    </StyledDockCell>
  );
}

function PanelsToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const [hover, setHover] = useState(false);
  const reduced = prefersReduced();

  const handleMouseEnter = () => setHover(true);
  const handleMouseLeave = () => setHover(false);

  return (
    <ToggleButton
      type="button"
      aria-label={open ? "Hide control panels" : "Show control panels"}
      aria-expanded={open}
      onClick={onToggle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      $open={open}
      $hover={hover}
      $reduced={reduced}
    >
      <ChevronWrap $open={open} $reduced={reduced}>
        <ChevronDown size={12} aria-hidden="true" />
      </ChevronWrap>
    </ToggleButton>
  );
}

export function Dock() {
  const dockOpen = useVolumeStore((s) => s.toolbar.dock);
  const toggleToolbar = useVolumeStore((s) => s.toggleToolbar);
  const view = useVolumeStore((s) => s.view);
  const reduced = prefersReduced();

  const handleToggle = () => toggleToolbar("dock");

  if (view !== "viewer") return null;

  return (
    <>
      <PanelsToggle open={dockOpen} onToggle={handleToggle} />

      {/* Fixed panel — slides over the stage, never resizes it */}
      <DockPanel $open={dockOpen} $reduced={reduced}>
        <DockCell title="Display">
          <DisplayCell />
        </DockCell>
        <DockCell title="Study">
          <StudyCell />
        </DockCell>
        <DockCell title="Navigation">
          <NavigationCell />
        </DockCell>
        <DockCell title="Session" last>
          <SessionCell />
        </DockCell>
      </DockPanel>
    </>
  );
}
