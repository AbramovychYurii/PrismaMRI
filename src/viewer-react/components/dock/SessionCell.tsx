import { ChevronLeft } from 'lucide-react';
import { useViewerHost, useViewerLabels, useViewerStore } from '../../viewer';
import styles from './SessionCell.module.css';

export function SessionCell() {
  const { onExit } = useViewerHost();
  const { session } = useViewerLabels();
  const volume = useViewerStore((s) => s.volume);

  return (
    <>
      {onExit && (
        <button className={styles.backButton} type="button" onClick={onExit} disabled={!volume}>
          <ChevronLeft size={13} />
          {session.exit}
        </button>
      )}
      <div className={styles.disclaimer}>
        <b className={styles.disclaimerBold}>{session.disclaimerLead}</b> {session.disclaimer}
      </div>
    </>
  );
}
