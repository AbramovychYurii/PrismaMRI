import { AnnotationOverlay } from '@/components/mcp/AnnotationOverlay';
import { MeasureMenu } from '@/components/rail/MeasureMenu';
import { SliceScrubber } from '@/components/rail/SliceScrubber';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  PLANE_ACCENT,
  PLANE_CROSSHAIR_AXES,
  PLANE_FOOTER,
  PLANE_GLYPH,
  PLANE_LABEL,
} from '@/constants';
import { useHalfSlabs } from '@/hooks/useHalfSlabs';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  type SlicePanelCore,
  axisColor,
  axisGlow,
  cursorFromClick,
  useSlicePanelCore,
} from '@/hooks/useSlicePanelCore';
import { downloadBlob } from '@/lib/download';
import { useVolumeStore } from '@/store/volumeStore';
import type { SlicePlane } from '@/types';
import { ChevronsUpDown, Download, Maximize2, Minimize2 } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ActiveBorder,
  ButtonTray,
  CrossCenter,
  CrossDot,
  CrossH,
  CrossV,
  CrosshairOverlay,
  FullscreenOverlay,
  MEASURE_DOT_PX,
  MEASURE_DOT_SHADOW,
  MeasureDot,
  MeasureLabel,
  MeasureLine,
  MobileCounter,
  MobileRightCol,
  PanelFooter,
  PanelHeader,
  PanelWrap,
  PlaneGlyph,
  PlaneLabel,
  PlaneLabelAccent,
  SliceCounter,
  SliceDim,
  StyledCanvas,
  TrayBtn,
} from './SlicePanel.styles';

const MEASURE_LINE_STROKE_STYLE: React.CSSProperties = { stroke: 'var(--measure)' };

function downloadSlice(canvas: HTMLCanvasElement | null, plane: SlicePlane, idx: number): void {
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `prismamri-${plane}-${idx}.png`);
  }, 'image/png');
}

const TrayButton = memo(function TrayButton({
  label,
  active,
  large,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  large?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label}>
      <TrayBtn
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        $active={active}
        $large={large}
      >
        {children}
      </TrayBtn>
    </Tooltip>
  );
});

function ExportSliceButton({
  canvasRef,
  plane,
  idx,
  large,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  plane: SlicePlane;
  idx: number;
  large?: boolean;
}) {
  return (
    <TrayButton
      large={large}
      label="Export slice as PNG"
      onClick={() => downloadSlice(canvasRef.current, plane, idx)}
    >
      <Download size={large ? 13 : 11} />
    </TrayButton>
  );
}

/** Everything here is a lookup on `plane` — no panel state involved. */
function PlaneHeading({ plane }: { plane: SlicePlane }) {
  const accent = PLANE_ACCENT[plane];
  const label = PLANE_LABEL[plane];
  return (
    <PanelHeader>
      <PlaneGlyph $color={accent}>{PLANE_GLYPH[plane]}</PlaneGlyph>
      <PlaneLabel>
        <PlaneLabelAccent $color={accent}>{label.primary}</PlaneLabelAccent>
        {` · ${label.secondary}`}
      </PlaneLabel>
    </PanelHeader>
  );
}

function SliceCount({ idx, total }: { idx: number; total: number }) {
  return (
    <SliceCounter>
      <span>{idx}</span>
      <SliceDim> / {total}</SliceDim>
    </SliceCounter>
  );
}

function MeasureContextMenu({
  measure,
  onSnapToView,
}: {
  measure: SlicePanelCore['measure'];
  onSnapToView: () => void;
}) {
  if (!measure.menu) return null;
  return (
    <MeasureMenu
      x={measure.menu.screenX}
      y={measure.menu.screenY}
      hasMeasurementFrom={measure.measurement !== null}
      onMeasureFrom={measure.onMeasureFrom}
      onMeasureTo={measure.onMeasureTo}
      onSnapToView={onSnapToView}
      onClear={measure.onClear}
      onClose={measure.closeMenu}
    />
  );
}

const CrosshairAndDots = memo(function CrosshairAndDots({
  plane,
  cross,
  dots,
  distanceMm,
}: {
  plane: SlicePlane;
  cross: { fx: number; fy: number } | null;
  dots: Array<{ fx: number; fy: number }>;
  distanceMm?: number | null;
}) {
  const axes = PLANE_CROSSHAIR_AXES[plane];
  const hasLine = dots.length === 2;
  return (
    <>
      {cross && (
        <CrosshairOverlay>
          <CrossH
            $color={axisColor(axes.h)}
            $glow={axisGlow(axes.h)}
            style={{ top: `${cross.fy * 100}%` }}
          />
          <CrossV
            $color={axisColor(axes.v)}
            $glow={axisGlow(axes.v)}
            style={{ left: `${cross.fx * 100}%` }}
          />
          <CrossCenter style={{ left: `${cross.fx * 100}%`, top: `${cross.fy * 100}%` }}>
            <CrossDot />
          </CrossCenter>
        </CrosshairOverlay>
      )}
      {hasLine && (
        <MeasureLine aria-hidden="true">
          <line
            x1={`${dots[0].fx * 100}%`}
            y1={`${dots[0].fy * 100}%`}
            x2={`${dots[1].fx * 100}%`}
            y2={`${dots[1].fy * 100}%`}
            style={MEASURE_LINE_STROKE_STYLE}
            strokeWidth="1.5"
            strokeDasharray="5 4"
            opacity="0.75"
            filter="drop-shadow(0 0 4px var(--measure-glow))"
          />
        </MeasureLine>
      )}
      {dots.map((dot, i) => (
        // Keyed by role (0 = from, 1 = to): coordinates collide when both
        // points coincide, which breaks reconciliation and leaks DOM nodes.
        <MeasureDot
          // biome-ignore lint/suspicious/noArrayIndexKey: stable role-based key
          key={i}
          style={{
            left: `${dot.fx * 100}%`,
            top: `${dot.fy * 100}%`,
            width: `${MEASURE_DOT_PX}px`,
            height: `${MEASURE_DOT_PX}px`,
            boxShadow: MEASURE_DOT_SHADOW,
          }}
        />
      ))}
      {hasLine && distanceMm !== null && distanceMm !== undefined && (
        <MeasureLabel
          style={{
            left: `${((dots[0].fx + dots[1].fx) / 2) * 100}%`,
            top: `${((dots[0].fy + dots[1].fy) / 2) * 100}%`,
          }}
        >
          {distanceMm.toFixed(1)} mm
        </MeasureLabel>
      )}
    </>
  );
});

/**
 * Moves the crosshair to the click position. The first click on an unfocused
 * panel only focuses it — rotating the 3-D model stays opt-in via the context
 * menu's "View from this side".
 */
function useCrosshairClick(core: SlicePanelCore, plane: SlicePlane) {
  const { canvasRef, dims, cursor, drawFracs } = core.frame;
  const { isActive, setActivePlane, setCursor } = core;
  return useCallback(
    (e: React.MouseEvent) => {
      if (!isActive) {
        setActivePlane(plane);
        return;
      }
      if (!canvasRef.current || !dims || !cursor) return;
      setCursor(cursorFromClick(e, canvasRef.current, plane, dims, cursor, drawFracs));
    },
    [canvasRef, dims, cursor, drawFracs, isActive, setActivePlane, setCursor, plane],
  );
}

const DRAG_THRESHOLD_PX = 3;

interface DragState {
  pointerId: number | null;
  startX: number;
  startY: number;
  started: boolean;
}

const NO_DRAG: DragState = { pointerId: null, startX: 0, startY: 0, started: false };

/**
 * Shift+drag measurement. Nothing reaches the store until the pointer clears
 * {@link DRAG_THRESHOLD_PX}, so a bare Shift+click neither drops a zero-length
 * measurement nor wipes the existing one.
 */
function useShiftDragMeasurement(core: SlicePanelCore, plane: SlicePlane) {
  const drag = useRef<DragState>(NO_DRAG);
  const { canvasRef, dims, cursor, drawFracs } = core.frame;
  const { isActive, setActivePlane, measure } = core;

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!e.shiftKey || e.button !== 0) return;
    if (!canvasRef.current || !dims || !cursor) return;
    e.preventDefault();
    if (!isActive) setActivePlane(plane);
    drag.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, started: false };
    // Capture so moves keep arriving once the pointer leaves the panel.
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const state = drag.current;
    if (state.pointerId !== e.pointerId || state.pointerId === null) return;
    if (!canvasRef.current) return;

    if (!state.started) {
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      // Anchor to where the press landed, not to the already-displaced pointer.
      measure.beginDrag(
        { clientX: state.startX, clientY: state.startY },
        canvasRef.current,
        drawFracs,
      );
      state.started = true;
    }
    measure.updateDrag(e, canvasRef.current, drawFracs);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (drag.current.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    drag.current = NO_DRAG;
  };

  return { onPointerDown, onPointerMove, onPointerUp };
}

function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onEscape]);
}

/** Pixels of vertical swipe that traverse the plane's full slice range. */
const TOUCH_SWIPE_FULL_RANGE_PX = 300;

function useSliceSwipe(core: SlicePanelCore, plane: SlicePlane) {
  const gesture = useRef<{ startY: number; startIdx: number } | null>(null);
  const { idx, total, onScrub } = core.slice;
  const { isActive, setActivePlane } = core;

  return {
    onTouchStart: (e: React.TouchEvent) => {
      if (!isActive) setActivePlane(plane);
      gesture.current = { startY: e.touches[0].clientY, startIdx: idx };
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (!gesture.current) return;
      const travelled = gesture.current.startY - e.touches[0].clientY;
      const step = Math.round((travelled / TOUCH_SWIPE_FULL_RANGE_PX) * total);
      if (step === 0) return;
      const nextIdx = Math.max(1, Math.min(total, gesture.current.startIdx + step));
      onScrub(nextIdx);
      gesture.current = { startY: e.touches[0].clientY, startIdx: nextIdx };
    },
    onTouchEnd: () => {
      gesture.current = null;
    },
  };
}

function ExpandedSlicePanel({ plane, onClose }: { plane: SlicePlane; onClose: () => void }) {
  const slabMm = useVolumeStore((s) => s.slabMm);
  const halfSlabs = useHalfSlabs(plane, slabMm);
  const core = useSlicePanelCore(plane, halfSlabs);
  const { idx, total, scrubVisible, setScrubVisible, onScrub } = core.slice;
  const { isActive, setActivePlane, measure } = core;

  const moveCrosshair = useCrosshairClick(core, plane);
  const dragHandlers = useShiftDragMeasurement(core, plane);
  const footer = PLANE_FOOTER[plane];

  // Expanding auto-focuses the panel so the first click moves the crosshair.
  useEffect(() => {
    setActivePlane(plane);
  }, [plane, setActivePlane]);

  useEscapeKey(onClose);

  return createPortal(
    <FullscreenOverlay
      $isActive={isActive}
      onClick={(e) => {
        e.stopPropagation();
        if (!e.shiftKey) moveCrosshair(e);
      }}
      onContextMenu={measure.onContextMenu}
      onWheel={(e) => {
        e.stopPropagation();
        core.slice.onWheel(e);
      }}
      {...dragHandlers}
    >
      <StyledCanvas ref={core.frame.canvasRef as React.Ref<HTMLCanvasElement>} />

      <CrosshairAndDots
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

export function SlicePanel({ plane }: { plane: SlicePlane }) {
  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();
  const slabMm = useVolumeStore((s) => s.slabMm);
  const halfSlabs = useHalfSlabs(plane, slabMm);
  const setCanvasRef = useVolumeStore((s) => s.setCanvasRef);

  const core = useSlicePanelCore(plane, halfSlabs);
  const { canvasRef } = core.frame;
  const { idx, total, scrubVisible, setScrubVisible, onScrub } = core.slice;
  const { isActive, measure } = core;

  const moveCrosshair = useCrosshairClick(core, plane);
  const swipeHandlers = useSliceSwipe(core, plane);

  // Registered so useMcpBridge can capture this canvas.
  useEffect(() => {
    setCanvasRef(plane, canvasRef.current);
    return () => setCanvasRef(plane, null);
  }, [plane, setCanvasRef, canvasRef]);

  // The scrubber is always on mobile — there is no toggle there.
  const scrubberVisible = isMobile || scrubVisible;

  return (
    <PanelWrap
      data-testid={`slice-panel-${plane}`}
      onClick={moveCrosshair}
      onContextMenu={measure.onContextMenu}
      onWheel={core.slice.onWheel}
      {...swipeHandlers}
      $isLast={plane === 'axial'}
      $isActive={isActive}
    >
      <StyledCanvas ref={canvasRef as React.Ref<HTMLCanvasElement>} />

      <CrosshairAndDots
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
            <TrayButton label="Expand panel" onClick={() => setExpanded(true)}>
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

      {expanded && <ExpandedSlicePanel plane={plane} onClose={() => setExpanded(false)} />}
    </PanelWrap>
  );
}
