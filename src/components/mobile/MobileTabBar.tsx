import type { MobileTab } from '@/types';
import {
  type ViewerFeatures,
  type ViewerLabels,
  useViewerFeatures,
  useViewerLabels,
  useViewerStore,
} from '@/viewer';
import { Box, Settings } from 'lucide-react';
import { useRef } from 'react';
import styled from 'styled-components';

const Bar = styled.div<{ $count: number }>`
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(${({ $count }) => $count}, 1fr);
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
  name: (labels: ViewerLabels) => string;
  accent: string;
  icon: (active: boolean, accent: string) => React.ReactNode;
}

const TABS: Tab[] = [
  {
    id: '3d',
    name: (l) => l.view3d,
    label: '3D',
    accent: 'var(--amber)',
    icon: (a) => <Box size={20} strokeWidth={a ? 1.8 : 1.4} />,
  },
  {
    id: 'coronal',
    name: (l) => l.planes.coronal.name,
    label: 'COR',
    accent: 'var(--amber)',
    icon: (a, acc) => <PlaneGlyph letter="C" active={a} accent={acc} />,
  },
  {
    id: 'sagittal',
    name: (l) => l.planes.sagittal.name,
    label: 'SAG',
    accent: 'var(--violet)',
    icon: (a, acc) => <PlaneGlyph letter="S" active={a} accent={acc} />,
  },
  {
    id: 'axial',
    name: (l) => l.planes.axial.name,
    label: 'AXI',
    accent: 'var(--azure)',
    icon: (a, acc) => <PlaneGlyph letter="A" active={a} accent={acc} />,
  },
  {
    id: 'controls',
    name: (l) => l.controlsTab,
    label: 'CTRL',
    accent: 'var(--amber)',
    icon: (a) => <Settings size={19} strokeWidth={a ? 1.8 : 1.4} />,
  },
];

/** The tabs a viewer offers: slice tabs need the rail feature, Controls the dock. */
function offeredTabs(features: ViewerFeatures): Tab[] {
  return TABS.filter((t) =>
    t.id === 'controls' ? features.dock : t.id === '3d' ? true : features.rail,
  );
}

/** Whether `tab` is offered — a persisted tab may name one a host has since turned off. */
export function isTabOffered(tab: MobileTab, features: ViewerFeatures): boolean {
  return offeredTabs(features).some((t) => t.id === tab);
}

/**
 * ←/→ (and Home/End) select the neighbouring tab, as tabs do; only the
 * selected tab sits in the Tab order.
 */
function nextTab(tabs: Tab[], current: MobileTab, key: string): MobileTab | null {
  const i = tabs.findIndex((t) => t.id === current);
  if (key === 'ArrowRight') return tabs[(i + 1) % tabs.length].id;
  if (key === 'ArrowLeft') return tabs[(i - 1 + tabs.length) % tabs.length].id;
  if (key === 'Home') return tabs[0].id;
  if (key === 'End') return tabs[tabs.length - 1].id;
  return null;
}

export function MobileTabBar() {
  const mobileTab = useViewerStore((s) => s.mobileTab);
  const setMobileTab = useViewerStore((s) => s.setMobileTab);
  const barRef = useRef<HTMLDivElement>(null);
  const tabs = offeredTabs(useViewerFeatures());
  const labels = useViewerLabels();

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const next = nextTab(tabs, mobileTab, e.key);
    if (!next) return;
    e.preventDefault();
    setMobileTab(next);
    barRef.current?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
  };

  return (
    <Bar ref={barRef} $count={tabs.length} role="tablist" aria-label="Views" onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
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
            aria-label={tab.name(labels)}
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
