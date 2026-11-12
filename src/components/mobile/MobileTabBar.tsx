import type { MobileTab } from '@/types';
import {
  type ViewerFeatures,
  type ViewerLabels,
  useViewerFeatures,
  useViewerLabels,
  useViewerStore,
} from '@/viewer';
import { Box, Settings } from 'lucide-react';
import { type CSSProperties, useRef } from 'react';
import styles from './MobileTabBar.module.css';

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
        fontFamily: 'var(--pmri-serif)',
        fontStyle: 'italic',
        fontSize: 20,
        lineHeight: 1,
        color: active ? accent : 'var(--pmri-ink-3)',
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
    accent: 'var(--pmri-amber)',
    icon: (a) => <Box size={20} strokeWidth={a ? 1.8 : 1.4} />,
  },
  {
    id: 'coronal',
    name: (l) => l.planes.coronal.name,
    label: 'COR',
    accent: 'var(--pmri-amber)',
    icon: (a, acc) => <PlaneGlyph letter="C" active={a} accent={acc} />,
  },
  {
    id: 'sagittal',
    name: (l) => l.planes.sagittal.name,
    label: 'SAG',
    accent: 'var(--pmri-violet)',
    icon: (a, acc) => <PlaneGlyph letter="S" active={a} accent={acc} />,
  },
  {
    id: 'axial',
    name: (l) => l.planes.axial.name,
    label: 'AXI',
    accent: 'var(--pmri-azure)',
    icon: (a, acc) => <PlaneGlyph letter="A" active={a} accent={acc} />,
  },
  {
    id: 'controls',
    name: (l) => l.controlsTab,
    label: 'CTRL',
    accent: 'var(--pmri-amber)',
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
    <div
      className={styles.bar}
      style={{ '--tab-count': tabs.length } as CSSProperties}
      ref={barRef}
      role="tablist"
      aria-label="Views"
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const active = mobileTab === tab.id;
        const handleClick = () => setMobileTab(tab.id);
        return (
          <button
            className={styles.tabBtn}
            key={tab.id}
            style={active ? { color: tab.accent } : undefined}
            type="button"
            role="tab"
            data-tab={tab.id}
            tabIndex={active ? 0 : -1}
            aria-selected={active}
            aria-label={tab.name(labels)}
            onClick={handleClick}
          >
            {tab.icon(active, tab.accent)}
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
