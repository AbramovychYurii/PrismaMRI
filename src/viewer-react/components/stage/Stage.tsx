import type { FramingInset } from '@prisma-mri/viewer-core';
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { useThreePreview } from '../../hooks/useThreePreview';
import { useViewControlsTarget } from '../../hooks/useViewControlsTarget';
import { ViewControls } from '../../view-controls/ViewControls';
import {
  useViewerFeatures,
  useViewerHost,
  useViewerLabels,
  useViewerLayout,
  useViewerStore,
} from '../../viewer';
import { AnnotationHud } from '../annotations/AnnotationHud';
import { DOCK_H } from '../dock/Dock';
import styles from './Stage.module.css';
import { StageAlert } from './StageAlert';
import { StageSeriesSelect } from './StageSeriesSelect';
import { ToolbarPill } from './ToolbarPill';

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { previewRef, status } = useThreePreview(canvasRef);
  useViewControlsTarget(previewRef);
  // Height the phone sheet covers, so the host's overlay (agent button) can sit above it.
  const [inset, setInset] = useState(0);
  const onInsetChange = useCallback((i: FramingInset) => setInset(i.bottom), []);
  // On desktop the controls dock overlays the bottom of the stage while open.
  const features = useViewerFeatures();
  const layout = useViewerLayout();
  const dockOpen = useViewerStore((s) => s.toolbar.dock);
  const toggleToolbar = useViewerStore((s) => s.toggleToolbar);
  const focus = useViewerStore((s) => s.toolbar.focus);
  const dockCover = layout === 'desktop' && features.dock && dockOpen && !focus ? DOCK_H : 0;
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
    <section
      className={styles.stage}
      data-focus={focus || undefined}
      data-testid="stage-section"
      data-key-zone="stage"
      style={
        {
          '--pmri-stage-inset-bottom': `${inset}px`,
          '--pmv-vc-bottom': `${dockCover}px`,
        } as CSSProperties
      }
    >
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
      {status === 'ready' && hasVolume && <ViewControls onInsetChange={onInsetChange} />}
      {/* The host's overlay (PrismaMRI: the AI agent button) hides in focus
          mode — it's part of the chrome the user asked to mute. Unmounting
          also collapses any expanded panel state cleanly on re-entry. */}
      {!focus && slots.stageOverlay}
    </section>
  );
}
