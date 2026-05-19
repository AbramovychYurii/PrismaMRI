import { useVolumeStore } from '@/store';
import type { MobileTab } from '@/types';
import { Box, Settings } from 'lucide-react';
import styled from 'styled-components';

// ── Styled components ──────────────────────────────────────────────────────

const Bar = styled.nav`
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
  color: ${({ $active, $accent }) => ($active ? $accent : 'var(--ink-4)')};
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

// ── Plane glyph icon ───────────────────────────────────────────────────────

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
        color: active ? accent : 'var(--ink-4)',
      }}
    >
      {letter}
    </span>
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────

interface Tab {
  id: MobileTab;
  label: string;
  accent: string;
  icon: (active: boolean, accent: string) => React.ReactNode;
}

const TABS: Tab[] = [
  {
    id: '3d',
    label: '3D',
    accent: 'var(--amber)',
    icon: (a) => <Box size={20} strokeWidth={a ? 1.8 : 1.4} />,
  },
  {
    id: 'coronal',
    label: 'COR',
    accent: 'var(--amber)',
    icon: (a, acc) => <PlaneGlyph letter="C" active={a} accent={acc} />,
  },
  {
    id: 'sagittal',
    label: 'SAG',
    accent: 'var(--violet)',
    icon: (a, acc) => <PlaneGlyph letter="S" active={a} accent={acc} />,
  },
  {
    id: 'axial',
    label: 'AXI',
    accent: 'var(--azure)',
    icon: (a, acc) => <PlaneGlyph letter="A" active={a} accent={acc} />,
  },
  {
    id: 'controls',
    label: 'CTRL',
    accent: 'var(--amber)',
    icon: (a) => <Settings size={19} strokeWidth={a ? 1.8 : 1.4} />,
  },
];

// ── Component ──────────────────────────────────────────────────────────────

export function MobileTabBar() {
  const mobileTab = useVolumeStore((s) => s.mobileTab);
  const setMobileTab = useVolumeStore((s) => s.setMobileTab);

  return (
    <Bar>
      {TABS.map((tab) => {
        const active = mobileTab === tab.id;
        const handleClick = () => setMobileTab(tab.id);
        return (
          <TabBtn
            key={tab.id}
            $active={active}
            $accent={tab.accent}
            type="button"
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
