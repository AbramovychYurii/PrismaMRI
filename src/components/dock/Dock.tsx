import { DisplayCell } from '@/components/dock/DisplayCell';
import { NavigationCell } from '@/components/dock/NavigationCell';
import { RenderCell } from '@/components/dock/RenderCell';
import { SessionCell } from '@/components/dock/SessionCell';
import { StudyCell } from '@/components/dock/StudyCell';
import { useTooltip } from '@/components/ui/Tooltip';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useViewerLabels, useViewerStore } from '@/viewer';
import { ChevronDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import styles from './Dock.module.css';

/** Dock height in px — mirrored in Dock.module.css (.panel, .toggle[data-open]). */
export const DOCK_H = 200;

function CellHead({ title }: { title: string }) {
  return (
    <div className={styles.styledCellHead}>
      <span className={styles.headTitle}>{title}</span>
      <span className={styles.headLine} />
    </div>
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
    <div className={styles.cell} data-last={last || undefined}>
      <CellHead title={title} />
      {children}
    </div>
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
  const reduced = usePrefersReducedMotion();
  const tip = useTooltip(open ? 'Hide control panels' : 'Show control panels', true);

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    setHover(true);
    tip.onMouseEnter(e);
  };
  const handleMouseLeave = () => {
    setHover(false);
    tip.onMouseLeave();
  };

  return (
    <>
      <button
        className={styles.toggle}
        type="button"
        aria-label={open ? 'Hide control panels' : 'Show control panels'}
        aria-expanded={open}
        onClick={onToggle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={tip.onFocus}
        onBlur={tip.onBlur}
        data-open={open || undefined}
        data-hover={hover || undefined}
        data-reduced={reduced || undefined}
      >
        <span className={styles.chevron}>
          <ChevronDown size={12} aria-hidden="true" />
        </span>
      </button>
      {tip.portal}
    </>
  );
}

export function Dock() {
  const { sections } = useViewerLabels();
  const dockOpen = useViewerStore((s) => s.toolbar.dock);
  const toggleToolbar = useViewerStore((s) => s.toggleToolbar);
  const volumeLoaded = useViewerStore((s) => s.volume !== null);
  const reduced = usePrefersReducedMotion();

  const handleToggle = () => toggleToolbar('dock');

  if (!volumeLoaded) return null;

  return (
    <>
      <PanelsToggle open={dockOpen} onToggle={handleToggle} />

      {/* Fixed panel — slides over the stage, never resizes it */}
      <div
        className={styles.panel}
        data-open={dockOpen || undefined}
        data-reduced={reduced || undefined}
      >
        <DockCell title={sections.display}>
          <DisplayCell />
        </DockCell>
        <DockCell title={sections.study}>
          <StudyCell />
        </DockCell>
        <DockCell title={sections.navigation}>
          <NavigationCell />
        </DockCell>
        <DockCell title={sections.render}>
          <RenderCell />
        </DockCell>
        <DockCell title={sections.session} last>
          <SessionCell />
        </DockCell>
      </div>
    </>
  );
}
