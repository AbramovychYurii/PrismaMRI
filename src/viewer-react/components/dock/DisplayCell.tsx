import { intensityUnit } from '@prisma-mri/viewer-core';
import { useViewerStore } from '../../viewer';
import styles from './DisplayCell.module.css';
import { HistogramBar } from './HistogramBar';

interface SliderRowProps {
  name: 'Window' | 'Level';
  value: number;
  /** 'HU' for CT; empty where the scalar has no unit to name (MR). */
  unit: string;
  min: number;
  max: number;
  accent: string;
  hint: string;
  onChange: (v: number) => void;
}

function SliderRow({ name, value, unit, min, max, accent, hint, onChange }: SliderRowProps) {
  const span = max - min || 1;
  const fill = `${Math.max(0, Math.min(100, ((value - min) / span) * 100))}%`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value));

  return (
    <div className={styles.sliderRowWrap}>
      <div className={styles.sliderLabelRow}>
        <div className={styles.sliderName}>{name}</div>
        <div className={styles.sliderValue}>
          {Math.round(value)}
          {unit && <span className={styles.huLabel}>{unit}</span>}
        </div>
      </div>
      <input
        type="range"
        // `wl-slider` is unstyled: kept as the hook the e2e specs find the sliders by.
        className={`wl-slider ${styles.wlSlider}`}
        aria-label={name}
        aria-valuetext={unit ? `${Math.round(value)} ${unit}` : String(Math.round(value))}
        min={min}
        max={max}
        step={Math.max(1, Math.round(span / 1000))}
        value={value}
        onChange={handleChange}
        style={
          {
            '--slider-accent': accent,
            '--slider-fill': fill,
          } as React.CSSProperties
        }
      />
      <div className={styles.sliderHint}>{hint}</div>
    </div>
  );
}

export function DisplayCell() {
  const wlDraft = useViewerStore((s) => s.wlDraft);
  const setWLDraft = useViewerStore((s) => s.setWLDraft);
  const volume = useViewerStore((s) => s.volume);
  const histogram = useViewerStore((s) => s.histogram);

  const scalarMin = volume ? Math.floor(volume.scalarMin) : -1000;
  const scalarMax = volume ? Math.ceil(volume.scalarMax) : 3000;
  const fullSpan = Math.max(1, scalarMax - scalarMin);
  const unit = intensityUnit(volume?.meta.modality);

  // Drafts drive the 3D contrast live (cheap uniform); the 2D slice recompute
  // is debounced off wlDraft by useWindowLevel (heavy for big volumes).
  function commit(patch: { window?: number; level?: number }) {
    setWLDraft(patch);
  }

  const handleWindowChange = (v: number) => commit({ window: v });
  const handleLevelChange = (v: number) => commit({ level: v });

  return (
    <div className={styles.displayCellWrap}>
      {histogram && <HistogramBar histogram={histogram} wl={wlDraft} />}
      <SliderRow
        name="Window"
        value={wlDraft.window}
        unit={unit}
        min={1}
        max={fullSpan}
        accent="var(--pmri-amber)"
        hint="Contrast span — narrower window sharpens bone & raises 3D contrast."
        onChange={handleWindowChange}
      />
      <SliderRow
        name="Level"
        value={wlDraft.level}
        unit={unit}
        min={scalarMin}
        max={scalarMax}
        accent="var(--pmri-teal)"
        hint="Brightness center — higher emphasizes dense tissue in 2D & 3D."
        onChange={handleLevelChange}
      />
    </div>
  );
}
