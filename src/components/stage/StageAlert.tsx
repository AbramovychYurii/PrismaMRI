/**
 * StageAlert — the viewer's error message. Failures that happen while a volume
 * is open (switching series, exporting the 3-D view) set the store's `error`,
 * which until now only the import screen showed, so they went unseen here.
 *
 * Sits top-centre over the stage, between the series switcher and the toolbar
 * pill, on the same layer as that chrome. Text is the import screen's error
 * style (ImportOverlay's ErrorMsg); the dismiss button is ConfirmModal's.
 */

import { useViewerStore } from '@/viewer';
import { X } from 'lucide-react';
import styles from './StageAlert.module.css';

export function StageAlert() {
  const error = useViewerStore((s) => s.error);
  const setError = useViewerStore((s) => s.setError);
  if (!error) return null;

  return (
    <div className={styles.bar}>
      <p className={styles.message} role="alert">
        {error}
      </p>
      <button
        className={styles.dismissBtn}
        type="button"
        aria-label="Close"
        onClick={() => setError(null)}
      >
        <X size={16} />
      </button>
    </div>
  );
}
