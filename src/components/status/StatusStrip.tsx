import { intensityUnit } from '@/lib/volume/units';
import { useViewerStore } from '@/viewer';
import styles from './StatusStrip.module.css';

function RunCell({
  k,
  v,
  dim,
  last,
}: {
  k: string;
  v: string;
  dim?: string;
  last?: boolean;
}) {
  return (
    <div className={styles.runCell} data-last={last || undefined}>
      <div className={styles.runKey}>{k}</div>
      <div className={styles.runVal}>
        {v}
        {dim && <span className={styles.runDim}>{` ${dim}`}</span>}
      </div>
    </div>
  );
}

/**
 * One line of what is open: scanner, volume size, spacing, modality and the
 * current measurement. Part of the viewer, placed by the host — PrismaMRI puts
 * it in its header.
 */
export function StatusStrip() {
  const volume = useViewerStore((s) => s.volume);
  const measurement = useViewerStore((s) => s.measurement);
  const meta = volume?.meta;
  const dims = meta?.dims;
  const spacing = meta?.spacing;

  let measureValue: string;
  let measureDim: string | undefined;
  if (!measurement) {
    measureValue = '—';
  } else if (measurement.distanceMm !== null) {
    measureValue = measurement.distanceMm.toFixed(1);
    measureDim = 'mm';
  } else {
    measureValue = 'Set endpoint';
  }

  return (
    <div className={styles.stripGrid}>
      <RunCell k="Scanner" v={meta?.scanner ?? '—'} />
      <RunCell
        k="Volume"
        v={dims ? `${dims[0]} × ${dims[1]} × ${dims[2]}` : '—'}
        dim={dims ? 'vox' : undefined}
      />
      <RunCell
        k="Spacing"
        v={spacing ? spacing.map((s) => s.toFixed(2)).join(' × ') : '—'}
        dim={spacing ? 'mm' : undefined}
      />
      <RunCell
        k="Modality"
        v={meta?.modality ?? '—'}
        dim={
          meta?.bitsAllocated
            ? [`· ${meta.bitsAllocated}-bit`, intensityUnit(meta.modality)]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
      />
      <div className={styles.runCell} data-last>
        <div className={styles.runKey}>Measure</div>
        {measurement?.distanceMm !== null && measurement !== null ? (
          <div className={`${styles.runVal} ${styles.measureVal}`}>
            {measureValue}
            {measureDim && <>{` ${measureDim}`}</>}
          </div>
        ) : (
          <div className={styles.runVal}>{measureValue}</div>
        )}
      </div>
    </div>
  );
}
