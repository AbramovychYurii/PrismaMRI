import { ACCENT_VAR, AXIS_ACCENT, type Axis } from '../../constants';
import { useViewerStore } from '../../viewer';
import styles from './NavigationCell.module.css';

const AXES: Axis[] = ['x', 'y', 'z'];

export function NavigationCell() {
  const cursor = useViewerStore((s) => s.cursor);

  return (
    <>
      <div className={styles.cursorSection}>
        <span className={styles.cursorLabel}>Cursor · voxel</span>
        <span className={styles.cursorValues}>
          {AXES.map((a) => {
            const c = ACCENT_VAR[AXIS_ACCENT[a]];
            return (
              <span className={styles.axisSpan} key={a} style={{ color: c }}>
                <i className={styles.axisLabel}>{a}</i>
                {cursor ? cursor[a] : '—'}
              </span>
            );
          })}
        </span>
      </div>
      <div className={styles.tipsSection}>
        <div className={styles.tipRow}>
          <b className={styles.tipKey}>Drag</b> any plane to scrub linked slices.
        </div>
        <div className={styles.tipRow}>
          <b className={styles.tipKey}>Wheel</b> to step slices ·{' '}
          <b className={styles.tipKey}>Shift+drag</b> to measure (fullscreen).
        </div>
        <div className={styles.tipRow}>
          <b className={styles.tipKey}>↑ ↓</b> step the active plane by 1 slice.
        </div>
        <div className={styles.tipRow}>
          <b className={styles.tipKey}>1 2 3</b> focus coronal · sagittal · axial.
        </div>
      </div>
    </>
  );
}
