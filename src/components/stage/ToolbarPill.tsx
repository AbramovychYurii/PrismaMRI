import { accentRgba } from '@/constants';
import { useVolumeStore } from '@/store';
import type { ToolbarState } from '@/types';
import { Layers, Maximize2, PanelRight } from 'lucide-react';
import { useState } from 'react';
import styled from 'styled-components';

// ── Types ──────────────────────────────────────────────────────────────────

interface ToolbarButton {
  id: keyof ToolbarState;
  icon: React.ReactNode;
  label?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const BUTTONS: ToolbarButton[] = [
  {
    id: 'planes',
    icon: <Layers size={16} />,
  },
  {
    id: 'focus',
    icon: <Maximize2 size={16} />,
  },
  {
    id: 'rail',
    icon: <PanelRight size={16} />,
  },
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
      {BUTTONS.map((b) => (
        <ToolButton key={b.id} btn={b} />
      ))}
    </PillWrap>
  );
}
