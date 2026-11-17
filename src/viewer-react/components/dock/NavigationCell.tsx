import { Fragment } from 'react';
import { ACCENT_VAR, AXIS_ACCENT, type Axis } from '../../constants';
import { useViewerLabels, useViewerStore } from '../../viewer';
import styles from './NavigationCell.module.css';

const AXES: Axis[] = ['x', 'y', 'z'];

export function NavigationCell() {
  const cursor = useViewerStore((s) => s.cursor);
  const { dock } = useViewerLabels();

  return (
    <>
      <div className={styles.cursorSection}>
        <span className={styles.cursorLabel}>{dock.cursor}</span>
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
        {dock.tips.map((row) => (
          <div className={styles.tipRow} key={row.map((t) => t.key).join('|')}>
            {row.map((tip, i) => (
              <Fragment key={tip.key}>
                {i > 0 && ' '}
                <b className={styles.tipKey}>{tip.key}</b> {tip.text}
              </Fragment>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
