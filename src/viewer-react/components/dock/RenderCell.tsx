import type { RenderPreset } from '@prisma-mri/viewer-core';
import { Info } from 'lucide-react';
import { useHover } from '../../hooks/useHover';
import { useViewerFeatures, useViewerStore } from '../../viewer';
import { Tooltip } from '../ui/Tooltip';
import styles from './RenderCell.module.css';

const SLAB_PRESETS: Array<[string, number]> = [
  ['Off', 0],
  ['3 mm', 3],
  ['5 mm', 5],
  ['10 mm', 10],
];

const PRESETS: { id: RenderPreset; name: string; desc: string }[] = [
  { id: 'mip', name: 'MIP', desc: 'Max intensity — full range grayscale' },
  { id: 'tissue', name: 'Tissue', desc: 'Fat · muscle · fluid · marrow' },
  { id: 'bone', name: 'Bone', desc: 'Highlights dense bright structures' },
];

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
  // In the host's order, not ours.
  const offered = features.renderPresets.flatMap((id) => PRESETS.filter((p) => p.id === id));

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
            <span className={styles.slabHeadTitle}>Slab MIP</span>
            <Tooltip
              label="Maximum Intensity Projection — composites several adjacent slices into one image. Reveals vessels, fractures and lesions that span multiple slices. 3–5 mm is ideal for most CT studies."
              above
            >
              <Info
                size={13}
                style={{ color: 'var(--pmri-ink-3)', cursor: 'default', flexShrink: 0 }}
              />
            </Tooltip>
            <span className={styles.slabHeadLine} />
          </div>
          <div className={styles.slabRow}>
            {SLAB_PRESETS.map(([label, mm]) => (
              <button
                className={styles.slabBtn}
                key={label}
                type="button"
                data-active={slabMm === mm || undefined}
                onClick={() => setSlabMm(mm)}
                aria-pressed={slabMm === mm}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
