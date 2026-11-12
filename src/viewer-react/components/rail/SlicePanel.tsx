import type { SlicePlane } from '@prisma-mri/viewer-core';
import { ChevronsUpDown, Maximize2, Minimize2 } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PLANE_AXIS_CODE } from '../../constants';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useHalfSlabs } from '../../hooks/useHalfSlabs';
import { useSlicePanelCore } from '../../hooks/useSlicePanelCore';
import {
  useCrosshairClick,
  useShiftDragMeasurement,
  useSliceSwipe,
} from '../../hooks/useSlicePanelGestures';
import { useSlicePanelKeys } from '../../hooks/useSlicePanelKeys';
import {
  useViewerEnvironment,
  useViewerLabels,
  useViewerLayout,
  useViewerStore,
} from '../../viewer';
import { AnnotationOverlay } from '../annotations/AnnotationOverlay';
import { SliceCrosshair } from './SliceCrosshair';
import styles from './SlicePanel.module.css';
import {
  ExportSliceButton,
  MeasureContextMenu,
  PlaneHeading,
  SliceCount,
  TrayButton,
} from './SlicePanelParts';
import { SliceScrubber } from './SliceScrubber';

function ExpandedSlicePanel({ plane }: { plane: SlicePlane }) {
  // Drawn inside the viewer, over its stage and rail — not over the host page.
  const { rootElement, portalContainer } = useViewerEnvironment();
  const container = rootElement ?? portalContainer;
  const slabMm = useViewerStore((s) => s.slabMm);
  const halfSlabs = useHalfSlabs(plane, slabMm);
  const setExpandedPlane = useViewerStore((s) => s.setExpandedPlane);
  const core = useSlicePanelCore(plane, halfSlabs);
  const { idx, total, scrubVisible, setScrubVisible, onScrub } = core.slice;
  const { isActive, measure } = core;

  const moveCrosshair = useCrosshairClick(core, plane);
  const dragHandlers = useShiftDragMeasurement(core, plane);
  const panelKeys = useSlicePanelKeys(core, plane);
  const hint = useViewerLabels().planes[plane].hint;

  const onClose = useCallback(() => setExpandedPlane(null), [setExpandedPlane]);

  // Expanding replaces the rail panel (and the button that was pressed), so
  // focus would drop to the page; it moves into the fullscreen panel instead,
  // and back to the rail panel when this one goes away.
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const overlay = overlayRef.current;
    overlay?.focus();
    return () => {
      const active = document.activeElement;
      if (active === document.body || active === container || overlay?.contains(active)) {
        // Within this viewer only — another viewer on the page has its own panels.
        requestAnimationFrame(() =>
          container.querySelector<HTMLElement>(`[data-slice-panel="${plane}"]`)?.focus(),
        );
      }
    };
  }, [plane, container]);
  useEscapeKey(onClose);

  return createPortal(
    <div
      className={styles.fullscreenOverlay}
      ref={overlayRef}
      data-active={isActive || undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (!e.shiftKey) moveCrosshair(e);
      }}
      onWheel={(e) => {
        e.stopPropagation();
        core.slice.onWheel(e);
      }}
      {...dragHandlers}
      {...panelKeys}
    >
      <canvas
        className={styles.styledCanvas}
        ref={core.frame.canvasRef as React.Ref<HTMLCanvasElement>}
      />

      <SliceCrosshair
        plane={plane}
        cross={core.cross}
        dots={measure.dots}
        distanceMm={measure.measurement?.distanceMm ?? null}
      />

      <AnnotationOverlay plane={plane} halfSlabs={halfSlabs} />

      <PlaneHeading plane={plane} />

      <div className={styles.buttonTray}>
        <ExportSliceButton canvasRef={core.frame.canvasRef} plane={plane} idx={idx} large />
        <TrayButton large label="Collapse panel" onClick={onClose}>
          <Minimize2 size={13} />
        </TrayButton>
        {total > 0 && (
          <TrayButton
            large
            label="Toggle slice scrubber"
            active={scrubVisible}
            onClick={() => setScrubVisible(plane, !scrubVisible)}
          >
            <ChevronsUpDown size={13} />
          </TrayButton>
        )}
      </div>

      {total > 0 && (
        <SliceScrubber
          large
          axis={plane}
          slice={idx}
          total={total}
          visible={scrubVisible}
          onChange={onScrub}
        />
      )}

      <div className={styles.panelFooter} data-scrub={scrubVisible || undefined}>
        <span>
          {hint} · {PLANE_AXIS_CODE[plane]}
          {measure.enabled && ' · SHIFT+DRAG · MEASURE'}
        </span>
        {total > 0 && <SliceCount idx={idx} total={total} />}
      </div>

      {isActive && <div className={styles.activeBorder} />}

      <MeasureContextMenu measure={measure} onSnapToView={core.onSnapToView} />
    </div>,
    container,
  );
}

function RailSlicePanel({ plane }: { plane: SlicePlane }) {
  const labels = useViewerLabels();
  const isMobile = useViewerLayout() === 'mobile';
  const slabMm = useViewerStore((s) => s.slabMm);
  const halfSlabs = useHalfSlabs(plane, slabMm);
  const setExpandedPlane = useViewerStore((s) => s.setExpandedPlane);

  const core = useSlicePanelCore(plane, halfSlabs);
  const { canvasRef } = core.frame;
  const { idx, total, scrubVisible, setScrubVisible, onScrub } = core.slice;
  const { isActive, measure } = core;

  const moveCrosshair = useCrosshairClick(core, plane);
  const swipeHandlers = useSliceSwipe(core, plane);
  const panelKeys = useSlicePanelKeys(core, plane);

  // The scrubber is always on mobile — there is no toggle there.
  const scrubberVisible = isMobile || scrubVisible;

  return (
    <div
      className={styles.panelWrap}
      data-testid={`slice-panel-${plane}`}
      data-slice-panel={plane}
      onClick={moveCrosshair}
      onWheel={core.slice.onWheel}
      {...swipeHandlers}
      {...panelKeys}
      data-last={plane === 'axial' || undefined}
      data-active={isActive || undefined}
    >
      <canvas className={styles.styledCanvas} ref={canvasRef as React.Ref<HTMLCanvasElement>} />

      <SliceCrosshair
        plane={plane}
        cross={core.cross}
        dots={measure.dots}
        distanceMm={measure.measurement?.distanceMm ?? null}
      />

      <PlaneHeading plane={plane} />

      {isMobile ? (
        <div className={styles.mobileRightCol}>
          {total > 0 && (
            <SliceScrubber
              axis={plane}
              slice={idx}
              total={total}
              visible
              inline
              onChange={onScrub}
            />
          )}
          <ExportSliceButton canvasRef={canvasRef} plane={plane} idx={idx} />
          {total > 0 && (
            <span className={styles.mobileCounter}>
              {idx}
              <span className={styles.sliceDim}> / {total}</span>
            </span>
          )}
        </div>
      ) : (
        <>
          <div className={styles.buttonTray}>
            <TrayButton label="Expand panel" onClick={() => setExpandedPlane(plane)}>
              <Maximize2 size={11} />
            </TrayButton>
            {total > 0 && (
              <TrayButton
                label="Toggle slice scrubber"
                active={scrubVisible}
                onClick={() => setScrubVisible(plane, !scrubVisible)}
              >
                <ChevronsUpDown size={11} />
              </TrayButton>
            )}
          </div>
          {total > 0 && (
            <SliceScrubber
              axis={plane}
              slice={idx}
              total={total}
              visible={scrubVisible}
              onChange={onScrub}
            />
          )}
        </>
      )}

      <div className={styles.panelFooter} data-scrub={scrubberVisible || undefined}>
        <span>
          {labels.planes[plane].hint} · {PLANE_AXIS_CODE[plane]}
        </span>
        {!isMobile && total > 0 && <SliceCount idx={idx} total={total} />}
      </div>

      {isActive && <div className={styles.activeBorder} />}

      <MeasureContextMenu measure={measure} onSnapToView={core.onSnapToView} />

      <AnnotationOverlay plane={plane} halfSlabs={halfSlabs} />
    </div>
  );
}

/**
 * A plane is either in the rail or fullscreen, never both.
 *
 * The expanded view used to be rendered *inside* the rail panel, so while it
 * was open the same plane ran two panel cores: two slice extractions, two
 * canvas painters, two annotation overlays and a doubled set of store
 * subscriptions. Switching on the store means only the visible one exists.
 */
export function SlicePanel({ plane }: { plane: SlicePlane }) {
  const expandedPlane = useViewerStore((s) => s.expandedPlane);
  return expandedPlane === plane ? (
    <ExpandedSlicePanel plane={plane} />
  ) : (
    <RailSlicePanel plane={plane} />
  );
}
