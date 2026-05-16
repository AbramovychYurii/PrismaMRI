import { useState, type ReactNode } from 'react';
import { useVolumeStore } from '@/store/volumeStore';
import { accentRgba } from '@/constants';
import type { ToolbarState } from '@/types';

interface ToolbarButton {
  id: keyof ToolbarState;
  label: string;
  icon: ReactNode;
}

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  width: 11,
  height: 11,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
};

const BUTTONS: ToolbarButton[] = [
  {
    id: 'planes',
    label: 'Planes',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 8l9-5 9 5-9 5-9-5z" />
        <path d="M3 14l9 5 9-5" />
      </svg>
    ),
  },
  {
    id: 'focus',
    label: 'Focus',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" />
      </svg>
    ),
  },
  {
    id: 'rail',
    label: 'Rail',
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="3" y="3" width="18" height="18" rx="1" />
        <path d="M15 3v18" />
      </svg>
    ),
  },
];

function ToolButton({ btn }: { btn: ToolbarButton }) {
  const on = useVolumeStore((s) => s.toolbar[btn.id]);
  const toggle = useVolumeStore((s) => s.toggleToolbar);
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={() => toggle(btn.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: on
          ? accentRgba('amber', 0.08)
          : hover
            ? 'rgba(28,24,18,0.92)'
            : 'rgba(20,18,14,0.85)',
        backdropFilter: 'blur(8px)',
        border: `1px solid ${on ? 'var(--amber-dim)' : 'var(--rule)'}`,
        borderRadius: 999,
        padding: '6px 14px',
        color: on ? 'var(--amber)' : hover ? 'var(--ink)' : 'var(--ink-2)',
        fontFamily: 'var(--mono)',
        fontSize: 10.5,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        transition: '120ms',
      }}
    >
      {btn.icon}
      {btn.label}
    </button>
  );
}

export function ToolbarPill() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 22,
        right: 30,
        display: 'flex',
        gap: 8,
        zIndex: 5,
      }}
    >
      {BUTTONS.map((b) => (
        <ToolButton key={b.id} btn={b} />
      ))}
    </div>
  );
}
