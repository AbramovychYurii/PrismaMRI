import { accentRgba } from '@/constants';
import { useVolumeStore } from '@/store';
import type { PlanesMode, ToolbarState } from '@/types';
import { Maximize2, PanelRight } from 'lucide-react';
import { useState } from 'react';
import styled from 'styled-components';

// ── Types ──────────────────────────────────────────────────────────────────

interface ToolbarButton {
  id: Exclude<keyof ToolbarState, 'planes'>;
  icon: React.ReactNode;
  label?: string;
}

// ── Icons ──────────────────────────────────────────────────────────────────

/** Isometric cube — top face same size as the single-slice icon */
function IconLayersAll() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Top face — same diamond shape as IconLayerOne */}
      <path d="M12 2 L22 7 L12 12 L2 7 Z" />
      {/* Right face */}
      <path d="M22 7 L22 18 L12 23 L12 12 Z" />
      {/* Left face */}
      <path d="M2 7 L12 12 L12 23 L2 18 Z" />
    </svg>
  );
}

/**
 * Clip plane icon — hemisphere with a flat cut face.
 * Left half: curved outer surface. Right half: flat inner face (ellipse rim).
 */
function IconClipPlane() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Outer curved half — open semicircle, no closing vertical line */}
      <path d="M12 3 A9 9 0 1 0 12 21" />
      {/* Cut-face ellipse — full brightness matching the rest of the icon */}
      <ellipse cx="12" cy="12" rx="2.8" ry="9" />
    </svg>
  );
}

/** Single layer — "active plane only" */
function IconLayerOne() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 7 2 12l10 5 10-5-10-5z" />
    </svg>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────

const BUTTONS: ToolbarButton[] = [
  { id: 'focus', icon: <Maximize2 size={20} /> },
  { id: 'rail', icon: <PanelRight size={20} /> },
];

// ── Styled components ──────────────────────────────────────────────────────

const PillWrap = styled.div`
  position: absolute;
  top: 22px;
  right: 30px;
  display: flex;
  gap: 8px;
  z-index: 5;
`;

const ToolBtn = styled.button<{ $on: boolean; $hover: boolean }>`
  background: ${({ $on, $hover }) =>
    $on ? accentRgba('amber', 0.08) : $hover ? 'rgba(28,24,18,0.92)' : 'rgba(20,18,14,0.85)'};
  backdrop-filter: blur(8px);
  border: 1px solid ${({ $on }) => ($on ? 'var(--amber-dim)' : 'var(--rule)')};
  border-radius: 999px;
  padding: 12px 12px;
  color: ${({ $on, $hover }) => ($on ? 'var(--amber)' : $hover ? 'var(--ink)' : 'var(--ink-2)')};
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: 120ms;
`;

// ── Sub-components ─────────────────────────────────────────────────────────

function PlanesButton() {
  const mode = useVolumeStore((s) => s.toolbar.planes);
  const cyclePlanesMode = useVolumeStore((s) => s.cyclePlanesMode);
  const [hover, setHover] = useState(false);

  const on = mode !== 'off';
  const icon: Record<PlanesMode, React.ReactNode> = {
    off: <IconLayerOne />,
    active: <IconLayerOne />,
    all: <IconLayersAll />,
  };
  const handleClick = () => cyclePlanesMode();
  const handleMouseEnter = () => setHover(true);
  const handleMouseLeave = () => setHover(false);

  return (
    <ToolBtn
      type="button"
      aria-label={
        mode === 'off' ? 'Hide planes' : mode === 'active' ? 'Show one plane' : 'Show all planes'
      }
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      $on={on}
      $hover={hover}
    >
      {icon[mode]}
    </ToolBtn>
  );
}

function ClipButton() {
  const on = useVolumeStore((s) => s.toolbar.clip);
  const toggle = useVolumeStore((s) => s.toggleToolbar);
  const [hover, setHover] = useState(false);

  return (
    <ToolBtn
      type="button"
      aria-label={on ? 'Disable clip plane' : 'Enable clip plane'}
      onClick={() => toggle('clip')}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      $on={on}
      $hover={hover}
    >
      <IconClipPlane />
    </ToolBtn>
  );
}

function ToolButton({ btn }: { btn: ToolbarButton }) {
  const on = useVolumeStore((s) => s.toolbar[btn.id]);
  const toggle = useVolumeStore((s) => s.toggleToolbar);
  const [hover, setHover] = useState(false);

  const handleClick = () => toggle(btn.id);
  const handleMouseEnter = () => setHover(true);
  const handleMouseLeave = () => setHover(false);

  return (
    <ToolBtn
      type="button"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      $on={on}
      $hover={hover}
    >
      {btn.icon}
      {btn.label}
    </ToolBtn>
  );
}

export function ToolbarPill() {
  return (
    <PillWrap>
      <PlanesButton />
      <ClipButton />
      {BUTTONS.map((b) => (
        <ToolButton key={b.id} btn={b} />
      ))}
    </PillWrap>
  );
}
