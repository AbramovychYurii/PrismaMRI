import { AnnotationOverlay } from '@/components/mcp/AnnotationOverlay';
import { SliceCrosshair } from '@/components/rail/SliceCrosshair';
import {
  ExportSliceButton,
  MeasureContextMenu,
  PlaneHeading,
  SliceCount,
  TrayButton,
} from '@/components/rail/SlicePanelParts';
import { SliceScrubber } from '@/components/rail/SliceScrubber';
import { PLANE_FOOTER } from '@/constants';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useHalfSlabs } from '@/hooks/useHalfSlabs';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSlicePanelCore } from '@/hooks/useSlicePanelCore';
import {
  useCrosshairClick,
  useShiftDragMeasurement,
  useSliceSwipe,
} from '@/hooks/useSlicePanelGestures';
import { useSlicePanelKeys } from '@/hooks/useSlicePanelKeys';
import { useVolumeStore } from '@/store/volumeStore';
import type { SlicePlane } from '@/types';
import { ChevronsUpDown, Maximize2, Minimize2 } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ActiveBorder,
  ButtonTray,
  FullscreenOverlay,
  MobileCounter,
  MobileRightCol,
  PanelFooter,
  PanelWrap,
  SliceDim,
  StyledCanvas,
} from './SlicePanel.styles';

function ExpandedSlicePanel({ plane }: { plane: SlicePlane }) {
  const slabMm = useVolumeStore((s) => s.slabMm);
  const halfSlabs = useHalfSlabs(plane, slabMm);
  const setExpandedPlane = useVolumeStore((s) => s.setExpandedPlane);
  const core = useSlicePanelCore(plane, halfSlabs);
  const { idx, total, scrubVisible, setScrubVisible, onScrub } = core.slice;
  const { isActive, measure } = core;

  const moveCrosshair = useCrosshairClick(core, plane);
  const dragHandlers = useShiftDragMeasurement(core, plane);
  const panelKeys = useSlicePanelKeys(core, plane);
  const footer = PLANE_FOOTER[plane];

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
      if (active === document.body || overlay?.contains(active)) {
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>(`[data-slice-panel="${plane}"]`)?.focus(),
        );
      }
    };
  }, [plane]);
  useEscapeKey(onClose);

  return createPortal(
    <FullscreenOverlay
      ref={overlayRef}
      $isActive={isActive}
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
      <StyledCanvas ref={core.frame.canvasRef as React.Ref<HTMLCanvasElement>} />

      <SliceCrosshair
        plane={plane}
        cross={core.cross}
        dots={measure.dots}
        distanceMm={measure.measurement?.distanceMm ?? null}
      />

      <AnnotationOverlay plane={plane} halfSlabs={halfSlabs} />

      <PlaneHeading plane={plane} />

      <ButtonTray>
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
      </ButtonTray>

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

      <PanelFooter $scrubVisible={scrubVisible}>
        <span>
          {footer.hint} · {footer.code} · SHIFT+DRAG · MEASURE
        </span>
        {total > 0 && <SliceCount idx={idx} total={total} />}
      </PanelFooter>

      {isActive && <ActiveBorder />}

      <MeasureContextMenu measure={measure} onSnapToView={core.onSnapToView} />
    </FullscreenOverlay>,
    document.body,
  );
}

function RailSlicePanel({ plane }: { plane: SlicePlane }) {
  const isMobile = useIsMobile();
  const slabMm = useVolumeStore((s) => s.slabMm);
  const halfSlabs = useHalfSlabs(plane, slabMm);
  const setExpandedPlane = useVolumeStore((s) => s.setExpandedPlane);

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
    <PanelWrap
      data-testid={`slice-panel-${plane}`}
      data-slice-panel={plane}
      onClick={moveCrosshair}
      onWheel={core.slice.onWheel}
      {...swipeHandlers}
      {...panelKeys}
      $isLast={plane === 'axial'}
      $isActive={isActive}
    >
      <StyledCanvas ref={canvasRef as React.Ref<HTMLCanvasElement>} />

      <SliceCrosshair
        plane={plane}
        cross={core.cross}
        dots={measure.dots}
        distanceMm={measure.measurement?.distanceMm ?? null}
      />

      <PlaneHeading plane={plane} />

      {isMobile ? (
        <MobileRightCol>
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
            <MobileCounter>
              {idx}
              <SliceDim> / {total}</SliceDim>
            </MobileCounter>
          )}
        </MobileRightCol>
      ) : (
        <>
          <ButtonTray>
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
          </ButtonTray>
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

      <PanelFooter $scrubVisible={scrubberVisible}>
        <span>
          {PLANE_FOOTER[plane].hint} · {PLANE_FOOTER[plane].code}
        </span>
        {!isMobile && total > 0 && <SliceCount idx={idx} total={total} />}
      </PanelFooter>

      {isActive && <ActiveBorder />}

      <MeasureContextMenu measure={measure} onSnapToView={core.onSnapToView} />

      <AnnotationOverlay plane={plane} halfSlabs={halfSlabs} />
    </PanelWrap>
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
  const expandedPlane = useVolumeStore((s) => s.expandedPlane);
  return expandedPlane === plane ? (
    <ExpandedSlicePanel plane={plane} />
  ) : (
    <RailSlicePanel plane={plane} />
  );
}
