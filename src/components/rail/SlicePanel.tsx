import { AnnotationOverlay } from '@/components/mcp/AnnotationOverlay';
import { MeasureMenu } from '@/components/rail/MeasureMenu';
import { SliceScrubber } from '@/components/rail/SliceScrubber';
import { Tooltip } from '@/components/ui/Tooltip';
import { PLANE_FOOTER, PLANE_GLYPH } from '@/constants';
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

function ExportSliceButton({ core, plane, large }: PanelPartProps & { large?: boolean }) {
  return (
    <TrayButton
      large={large}
      label="Export slice as PNG"
      onClick={() => downloadSlice(core.canvasRef.current, plane, core.idx)}
    >
      <Download size={large ? 13 : 11} />
    </TrayButton>
  );
}

interface PanelPartProps {
  core: SlicePanelCore;
  plane: SlicePlane;
}

function PlaneHeading({ core, plane }: PanelPartProps) {
  return (
    <PanelHeader>
      <PlaneGlyph $color={core.accentColor}>{PLANE_GLYPH[plane]}</PlaneGlyph>
      <PlaneLabel>
        <PlaneLabelAccent $color={core.accentColor}>{core.planeLabel.primary}</PlaneLabelAccent>
        {` · ${core.planeLabel.secondary}`}
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

function MeasureContextMenu({ core }: { core: SlicePanelCore }) {
  if (!core.menu) return null;
  return (
    <MeasureMenu
      x={core.menu.screenX}
      y={core.menu.screenY}
      hasMeasurementFrom={core.measurement !== null}
      onMeasureFrom={core.onMeasureFrom}
      onMeasureTo={core.onMeasureTo}
      onSnapToView={core.onSnapToView}
      onClear={core.onClear}
      onClose={core.closeMenu}
    />
  );
}

const CrosshairAndDots = memo(function CrosshairAndDots({
  cross,
  axes,
  adjustedDots,
  distanceMm,
}: {
  cross: { fx: number; fy: number } | null;
  axes: { v: 'x' | 'y' | 'z'; h: 'x' | 'y' | 'z' };
  adjustedDots: Array<{ fx: number; fy: number }>;
  distanceMm?: number | null;
}) {
  const hasLine = adjustedDots.length === 2;
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
            x1={`${adjustedDots[0].fx * 100}%`}
            y1={`${adjustedDots[0].fy * 100}%`}
            x2={`${adjustedDots[1].fx * 100}%`}
            y2={`${adjustedDots[1].fy * 100}%`}
            style={MEASURE_LINE_STROKE_STYLE}
            strokeWidth="1.5"
            strokeDasharray="5 4"
            opacity="0.75"
            filter="drop-shadow(0 0 4px var(--measure-glow))"
          />
        </MeasureLine>
      )}
      {adjustedDots.map((dot, i) => (
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
            left: `${((adjustedDots[0].fx + adjustedDots[1].fx) / 2) * 100}%`,
            top: `${((adjustedDots[0].fy + adjustedDots[1].fy) / 2) * 100}%`,
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
  const { canvasRef, dims, cursor, drawFracs, isActive, setActivePlane, setCursor } = core;
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
  const { canvasRef, dims, cursor, drawFracs, isActive, setActivePlane } = core;

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
      core.beginDragMeasurement(
        { clientX: state.startX, clientY: state.startY },
        canvasRef.current,
        drawFracs,
      );
      state.started = true;
    }
    core.updateDragMeasurement(e, canvasRef.current, drawFracs);
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
  const { idx, total, isActive, setActivePlane, handleScrub } = core;

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
      handleScrub(nextIdx);
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
  const { idx, total, isActive, scrubVisible, setScrubVisible, setActivePlane } = core;

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
      onContextMenu={core.handleContextMenu}
      onWheel={(e) => {
        e.stopPropagation();
        core.onWheel(e);
      }}
      {...dragHandlers}
    >
      <StyledCanvas ref={core.canvasRef as React.Ref<HTMLCanvasElement>} />

      <CrosshairAndDots
        cross={core.cross}
        axes={core.axes}
        adjustedDots={core.adjustedDots}
        distanceMm={core.measurement?.distanceMm ?? null}
      />

      <AnnotationOverlay plane={plane} halfSlabs={halfSlabs} />

      <PlaneHeading core={core} plane={plane} />

      <ButtonTray>
        <ExportSliceButton core={core} plane={plane} large />
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
          onChange={core.handleScrub}
        />
      )}

      <PanelFooter $scrubVisible={scrubVisible}>
        <span>
          {footer.hint} · {footer.code} · SHIFT+DRAG · MEASURE
        </span>
        {total > 0 && <SliceCount idx={idx} total={total} />}
      </PanelFooter>

      {isActive && <ActiveBorder />}

      <MeasureContextMenu core={core} />
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
  const { canvasRef, idx, total, isActive, scrubVisible, setScrubVisible } = core;

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
      onContextMenu={core.handleContextMenu}
      onWheel={core.onWheel}
      {...swipeHandlers}
      $isLast={plane === 'axial'}
      $isActive={isActive}
    >
      <StyledCanvas ref={canvasRef as React.Ref<HTMLCanvasElement>} />

      <CrosshairAndDots
        cross={core.cross}
        axes={core.axes}
        adjustedDots={core.adjustedDots}
        distanceMm={core.measurement?.distanceMm ?? null}
      />

      <PlaneHeading core={core} plane={plane} />

      {isMobile ? (
        <MobileRightCol>
          {total > 0 && (
            <SliceScrubber
              axis={plane}
              slice={idx}
              total={total}
              visible
              inline
              onChange={core.handleScrub}
            />
          )}
          <ExportSliceButton core={core} plane={plane} />
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
              onChange={core.handleScrub}
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

      <MeasureContextMenu core={core} />

      <AnnotationOverlay plane={plane} halfSlabs={halfSlabs} />

      {expanded && <ExpandedSlicePanel plane={plane} onClose={() => setExpanded(false)} />}
    </PanelWrap>
  );
}
