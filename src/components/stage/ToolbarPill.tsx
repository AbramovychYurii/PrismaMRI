import { StageMenu } from '@/components/stage/StageMenu';
import { Tooltip } from '@/components/ui/Tooltip';
import { accentRgba } from '@/constants';
import { useHover } from '@/hooks/useHover';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ThreePreview } from '@/lib/volume/three-preview';
import { useVolumeStore } from '@/store';
import type { PlanesMode, ToolbarState } from '@/types';
import { Maximize2, PanelRight } from 'lucide-react';
import styled from 'styled-components';

// ── Types ──────────────────────────────────────────────────────────────────

interface ToolbarButton {
  id: Exclude<keyof ToolbarState, 'planes'>;
  icon: React.ReactNode;
  label?: string;
  tipOff: string;
  tipOn: string;
  /** Hide this button on mobile — it's meaningless without the sidebar. */
  mobileHidden?: boolean;
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
      strokeWidth={2}
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
  {
    id: 'focus',
    icon: <Maximize2 size={20} />,
    tipOff: 'Focus mode',
    tipOn: 'Exit focus mode',
    mobileHidden: true,
  },
  {
    id: 'rail',
    icon: <PanelRight size={20} />,
    tipOff: 'Show side panel',
    tipOn: 'Hide side panel',
    mobileHidden: true,
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

  @media (max-width: 767px) {
    top: 12px;
    right: 12px;
    gap: 6px;
  }
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
  -webkit-tap-highlight-color: transparent;

  @media (max-width: 767px) {
    /* Ensure minimum 44×44 px touch target. */
    padding: 14px 14px;
    min-width: 44px;
    min-height: 44px;
    justify-content: center;
  }
`;

// ── Sub-components ─────────────────────────────────────────────────────────

const PLANES_TIP: Record<PlanesMode, string> = {
  off: 'Show slice planes',
  active: 'Show all 3 planes',
  all: 'Hide slice planes',
};

function PlanesButton() {
  const mode = useVolumeStore((s) => s.toolbar.planes);
  const cyclePlanesMode = useVolumeStore((s) => s.cyclePlanesMode);
  const { hover, onMouseEnter, onMouseLeave } = useHover();

  const on = mode !== 'off';
  const icon: Record<PlanesMode, React.ReactNode> = {
    off: <IconLayerOne />,
    active: <IconLayerOne />,
    all: <IconLayersAll />,
  };

  return (
    <Tooltip label={PLANES_TIP[mode]}>
      <ToolBtn
        type="button"
        aria-label={PLANES_TIP[mode]}
        onClick={cyclePlanesMode}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        $on={on}
        $hover={hover}
      >
        {icon[mode]}
      </ToolBtn>
    </Tooltip>
  );
}

function ClipButton() {
  const on = useVolumeStore((s) => s.toolbar.clip);
  const toggle = useVolumeStore((s) => s.toggleToolbar);
  const { hover, onMouseEnter, onMouseLeave } = useHover();

  return (
    <Tooltip label={on ? 'Disable clip mode' : 'Clip volume at active slice'}>
      <ToolBtn
        type="button"
        aria-label={on ? 'Disable clip mode' : 'Clip volume at active slice'}
        onClick={() => toggle('clip')}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        $on={on}
        $hover={hover}
      >
        <IconClipPlane />
      </ToolBtn>
    </Tooltip>
  );
}

function ToolButton({ btn }: { btn: ToolbarButton }) {
  const on = useVolumeStore((s) => s.toolbar[btn.id]);
  const toggle = useVolumeStore((s) => s.toggleToolbar);
  const { hover, onMouseEnter, onMouseLeave } = useHover();

  return (
    <Tooltip label={on ? btn.tipOn : btn.tipOff}>
      <ToolBtn
        type="button"
        aria-label={on ? btn.tipOn : btn.tipOff}
        onClick={() => toggle(btn.id)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        $on={on}
        $hover={hover}
      >
        {btn.icon}
        {btn.label}
      </ToolBtn>
    </Tooltip>
  );
}

interface ToolbarPillProps {
  previewRef: React.MutableRefObject<ThreePreview | null>;
}

export function ToolbarPill({ previewRef }: ToolbarPillProps) {
  const isMobile = useIsMobile();
  const visible = BUTTONS.filter((b) => !(isMobile && b.mobileHidden));
  // Rail is always the last button — StageMenu sits just before it.
  const beforeMenu = visible.filter((b) => b.id !== 'rail');
  const afterMenu = visible.filter((b) => b.id === 'rail');
  return (
    <PillWrap>
      <PlanesButton />
      <ClipButton />
      {beforeMenu.map((b) => (
        <ToolButton key={b.id} btn={b} />
      ))}
      <StageMenu previewRef={previewRef} />
      {afterMenu.map((b) => (
        <ToolButton key={b.id} btn={b} />
      ))}
    </PillWrap>
  );
}
