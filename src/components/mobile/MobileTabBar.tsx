import { PLANE_LABEL } from '@/constants';
import { useVolumeStore } from '@/store';
import type { MobileTab } from '@/types';
import { Box, Settings } from 'lucide-react';
import { useRef } from 'react';
import styled from 'styled-components';

const Bar = styled.div`
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  background: var(--panel);
  border-top: 1px solid var(--rule);
  /* Safe area for notch phones (iPhone X+) */
  padding-bottom: env(safe-area-inset-bottom, 0px);
`;

const TabBtn = styled.button<{ $active: boolean; $accent: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 10px 4px 8px;
  min-height: 56px;
  border: none;
  background: none;
  color: ${({ $active, $accent }) => ($active ? $accent : 'var(--ink-3)')};
  cursor: pointer;
  transition: color 100ms;
  -webkit-tap-highlight-color: transparent;
`;

const TabLabel = styled.span`
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
`;

function PlaneGlyph({
  letter,
  active,
  accent,
}: {
  letter: string;
  active: boolean;
  accent: string;
}) {
  return (
    <span
      style={{
        fontFamily: 'var(--serif)',
        fontStyle: 'italic',
        fontSize: 20,
        lineHeight: 1,
        color: active ? accent : 'var(--ink-3)',
      }}
    >
      {letter}
    </span>
  );
}

interface Tab {
  id: MobileTab;
  label: string;
  /** Spoken name — the visible label is an abbreviation. */
  name: string;
  accent: string;
  icon: (active: boolean, accent: string) => React.ReactNode;
}

const TABS: Tab[] = [
  {
    id: '3d',
    name: '3D view',
    label: '3D',
    accent: 'var(--amber)',
    icon: (a) => <Box size={20} strokeWidth={a ? 1.8 : 1.4} />,
  },
  {
    id: 'coronal',
    name: PLANE_LABEL.coronal.primary,
    label: 'COR',
    accent: 'var(--amber)',
    icon: (a, acc) => <PlaneGlyph letter="C" active={a} accent={acc} />,
  },
  {
    id: 'sagittal',
    name: PLANE_LABEL.sagittal.primary,
    label: 'SAG',
    accent: 'var(--violet)',
    icon: (a, acc) => <PlaneGlyph letter="S" active={a} accent={acc} />,
  },
  {
    id: 'axial',
    name: PLANE_LABEL.axial.primary,
    label: 'AXI',
    accent: 'var(--azure)',
    icon: (a, acc) => <PlaneGlyph letter="A" active={a} accent={acc} />,
  },
  {
    id: 'controls',
    name: 'Controls (CTRL)',
    label: 'CTRL',
    accent: 'var(--amber)',
    icon: (a) => <Settings size={19} strokeWidth={a ? 1.8 : 1.4} />,
  },
];

/**
 * ←/→ (and Home/End) select the neighbouring tab, as tabs do; only the
 * selected tab sits in the Tab order.
 */
function nextTab(current: MobileTab, key: string): MobileTab | null {
  const i = TABS.findIndex((t) => t.id === current);
  if (key === 'ArrowRight') return TABS[(i + 1) % TABS.length].id;
  if (key === 'ArrowLeft') return TABS[(i - 1 + TABS.length) % TABS.length].id;
  if (key === 'Home') return TABS[0].id;
  if (key === 'End') return TABS[TABS.length - 1].id;
  return null;
}

export function MobileTabBar() {
  const mobileTab = useVolumeStore((s) => s.mobileTab);
  const setMobileTab = useVolumeStore((s) => s.setMobileTab);
  const barRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const next = nextTab(mobileTab, e.key);
    if (!next) return;
    e.preventDefault();
    setMobileTab(next);
    barRef.current?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
  };

  return (
    <Bar ref={barRef} role="tablist" aria-label="Views" onKeyDown={onKeyDown}>
      {TABS.map((tab) => {
        const active = mobileTab === tab.id;
        const handleClick = () => setMobileTab(tab.id);
        return (
          <TabBtn
            key={tab.id}
            $active={active}
            $accent={tab.accent}
            type="button"
            role="tab"
            data-tab={tab.id}
            tabIndex={active ? 0 : -1}
            aria-selected={active}
            aria-label={tab.name}
            onClick={handleClick}
          >
            {tab.icon(active, tab.accent)}
            <TabLabel>{tab.label}</TabLabel>
          </TabBtn>
        );
      })}
    </Bar>
  );
}
