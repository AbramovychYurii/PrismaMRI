import { Info } from 'lucide-react';
import { useHover } from '../../hooks/useHover';
import { fillLabel, useViewerFeatures, useViewerLabels, useViewerStore } from '../../viewer';
import { Tooltip } from '../ui/Tooltip';
import styles from './RenderCell.module.css';

/** Slab thicknesses on offer, in mm; 0 is off. */
const SLAB_PRESETS = [0, 3, 5, 10];

function PresetButton({
  name,
  desc,
  active,
  onClick,
}: {
  name: string;
  desc: string;
  active: boolean;
  onClick: () => void;
}) {
  const { hover, onMouseEnter, onMouseLeave } = useHover();
  return (
    <Tooltip label={desc} above>
      <button
        className={styles.presetBtn}
        type="button"
        data-active={active || undefined}
        data-hover={(hover && !active) || undefined}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        aria-pressed={active}
        aria-label={`${name} — ${desc}`}
      >
        <span className={styles.presetName}>{name}</span>
      </button>
    </Tooltip>
  );
}

export function RenderCell() {
  const renderPreset = useViewerStore((s) => s.renderPreset);
  const setRenderPreset = useViewerStore((s) => s.setRenderPreset);
  const slabMm = useViewerStore((s) => s.slabMm);
  const setSlabMm = useViewerStore((s) => s.setSlabMm);
  const features = useViewerFeatures();
  const { dock } = useViewerLabels();
  // In the host's order, not ours.
  const offered = features.renderPresets.flatMap((id) =>
    id in dock.presets ? [{ id, ...dock.presets[id as keyof typeof dock.presets] }] : [],
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.presetGrid}>
        {offered.map(({ id, name, desc }) => (
          <PresetButton
            key={id}
            name={name}
            desc={desc}
            active={renderPreset === id}
            onClick={() => setRenderPreset(id)}
          />
        ))}
      </div>

      {features.slab && (
        <div className={styles.slabSection}>
          <div className={styles.slabHead}>
            <span className={styles.slabHeadTitle}>{dock.slabTitle}</span>
            <Tooltip label={dock.slabInfo} above>
              <Info
                size={13}
                style={{ color: 'var(--pmri-ink-3)', cursor: 'default', flexShrink: 0 }}
              />
            </Tooltip>
            <span className={styles.slabHeadLine} />
          </div>
          <div className={styles.slabRow}>
            {SLAB_PRESETS.map((mm) => (
              <button
                className={styles.slabBtn}
                key={mm}
                type="button"
                data-active={slabMm === mm || undefined}
                onClick={() => setSlabMm(mm)}
                aria-pressed={slabMm === mm}
              >
                {mm === 0 ? dock.slabOff : fillLabel(dock.slabMm, { mm })}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
