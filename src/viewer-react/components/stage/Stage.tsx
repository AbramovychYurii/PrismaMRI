import { useEffect, useRef } from 'react';
import { useThreePreview } from '../../hooks/useThreePreview';
import { useViewerHost, useViewerLabels, useViewerStore } from '../../viewer';
import { AnnotationHud } from '../annotations/AnnotationHud';
import styles from './Stage.module.css';
import { StageAlert } from './StageAlert';
import { StageSeriesSelect } from './StageSeriesSelect';
import { ToolbarPill } from './ToolbarPill';

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { previewRef, status } = useThreePreview(canvasRef);
  const toggleToolbar = useViewerStore((s) => s.toggleToolbar);
  const focus = useViewerStore((s) => s.toolbar.focus);
  const hasVolume = useViewerStore((s) => s.prepared3D !== null);
  const { slots } = useViewerHost();
  const labels = useViewerLabels();

  // Focus mode is left by its own button, which is not shown without a 3-D
  // view — and the mode is kept across reloads — so leave it here instead of
  // stranding a full-window stage over the slice panels.
  useEffect(() => {
    if (status === 'unavailable' && focus) toggleToolbar('focus');
  }, [status, focus, toggleToolbar]);

  return (
    <section className={styles.stage} data-focus={focus || undefined} data-testid="stage-section">
      <canvas className={styles.canvas} ref={canvasRef} data-testid="stage-canvas" />
      {status === 'ready' && !hasVolume && (
        <div className={styles.noVolume}>{labels.stage.noVolume}</div>
      )}
      {status === 'unavailable' && (
        <div className={styles.message}>
          <p className={styles.messageTitle}>{labels.stage.unavailableTitle}</p>
          <p className={styles.messageHint}>{labels.stage.unavailableHint}</p>
        </div>
      )}
      {/* Always mounted, empty while the view is fine: a live region added
          together with its text is not reliably announced. */}
      <output className={styles.message}>
        {status === 'context-lost' && (
          <>
            <p className={styles.messageTitle}>{labels.stage.contextLostTitle}</p>
            <p className={styles.messageHint}>{labels.stage.contextLostHint}</p>
          </>
        )}
      </output>
      <StageSeriesSelect />
      <StageAlert />
      <ToolbarPill previewRef={previewRef} has3D={status !== 'unavailable'} />
      <AnnotationHud />
      {/* The host's overlay (PrismaMRI: the AI agent button) hides in focus
          mode — it's part of the chrome the user asked to mute. Unmounting
          also collapses any expanded panel state cleanly on re-entry. */}
      {!focus && slots.stageOverlay}
    </section>
  );
}
