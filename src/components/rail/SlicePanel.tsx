/**
 * SlicePanel — single 2-D plane viewer (rail and fullscreen).
 *
 * One panel per plane is rendered inside the Rail aside. Each panel reads its
 * own slice from the active volume, draws it onto a canvas via
 * `useSlicePanelCore`, and overlays crosshair + measurement + AI markers.
 *
 * Expanding a panel mounts an `ExpandedSlicePanel` portal that renders the
 * same content fullscreen with larger controls.
 *
 * All visual styling lives in `SlicePanel.styles.ts`.
 */

import { AnnotationOverlay } from '@/components/mcp/AnnotationOverlay';
import { MeasureMenu } from '@/components/rail/MeasureMenu';
import { SliceScrubber } from '@/components/rail/SliceScrubber';
import { Tooltip } from '@/components/ui/Tooltip';
import { PLANE_FOOTER, PLANE_GLYPH } from '@/constants';
import { useHalfSlabs } from '@/hooks/useHalfSlabs';
import { useIsMobile } from '@/hooks/useIsMobile';
import { axisColor, axisGlow, cursorFromClick, useSlicePanelCore } from '@/hooks/useSlicePanelCore';
import { useVolumeStore } from '@/store/volumeStore';
import type { SlicePlane } from '@/types';
import { ChevronsUpDown, Download, Maximize2, Minimize2 } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
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

// ── Helpers ────────────────────────────────────────────────────────────────

/** Downloads the current canvas slice as a PNG file. */
function downloadSlice(canvas: HTMLCanvasElement | null, plane: SlicePlane, idx: number): void {
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prismamri-${plane}-${idx}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

// ── Inline style constants (avoid per-render object allocations) ──────────

const MEASURE_LINE_STROKE_STYLE: React.CSSProperties = { stroke: 'var(--measure)' };

// ── TrayButton ─────────────────────────────────────────────────────────────

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

// ── Shared crosshair + measurement overlay ─────────────────────────────────

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
        // Stable index key — we render at most 2 dots and they're identified
        // by position in the array (0 = from, 1 = to).  Using fx/fy in the key
        // breaks reconciliation when both points coincide (Shift+click without
        // drag), leaking dead nodes into the DOM as the user clicks around.
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

// ── ExpandedSlicePanel ──────────────────────────────────────────────────────

function ExpandedSlicePanel({
  plane,
  onClose,
}: {
  plane: SlicePlane;
  onClose: () => void;
}) {
  // Slab MIP now lives in the global store so it stays in sync across the
  // rail panels and the fullscreen view, and is controlled from RenderCell.
  const slabMm = useVolumeStore((s) => s.slabMm);
  const halfSlabs = useHalfSlabs(plane, slabMm);

  const {
    canvasRef,
    drawFracs,
    idx,
    total,
    cross,
    adjustedDots,
    axes,
    accentColor,
    planeLabel,
    isActive,
    cursor,
    dims,
    scrubVisible,
    setScrubVisible,
    setCursor,
    setActivePlane,
    onWheel,
    handleScrub,
    handleContextMenu,
    onSnapToView,
    measurement,
    menu,
    onMeasureFrom,
    onMeasureTo,
    onClear,
    closeMenu,
    beginDragMeasurement,
    updateDragMeasurement,
  } = useSlicePanelCore(plane, halfSlabs);

  /**
   * Tracks an in-flight Shift-drag.  We deliberately don't write any
   * measurement to the store on `pointerdown` — only on the first pointermove
   * that exceeds `DRAG_THRESHOLD_PX`.  This avoids two problems:
   *  • A bare Shift-click (no drag) would otherwise create a degenerate
   *    `from === to` measurement and leave an orange dot behind.
   *  • Two dots at the same coordinate produced duplicate React keys, which
   *    broke reconciliation and leaked nodes as the user clicked around.
   */
  const DRAG_THRESHOLD_PX = 3;
  const dragRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    started: boolean;
  }>({ pointerId: null, startX: 0, startY: 0, started: false });

  const footer = PLANE_FOOTER[plane];

  // Expanding a panel auto-focuses it — first click should move the cursor
  // immediately, not just focus an already-fullscreen view.
  useEffect(() => {
    setActivePlane(plane);
  }, [plane, setActivePlane]);

  // Esc collapses the fullscreen panel back to the rail view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    // Shift+click is reserved for measurement — don't also move the crosshair.
    if (e.shiftKey) return;
    // First click on an inactive panel just focuses it — cursor only moves on
    // subsequent clicks. Rotating the 3-D model is opt-in via the context-menu
    // "View from this side" item.
    if (!isActive) {
      setActivePlane(plane);
      return;
    }
    if (!canvasRef.current || !dims || !cursor) return;
    setCursor(cursorFromClick(e, canvasRef.current, plane, dims, cursor, drawFracs));
  }

  function handlePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    // Shift+drag = measurement.  Left-button pointers only.
    if (!e.shiftKey || e.button !== 0) return;
    if (!canvasRef.current || !dims || !cursor) return;
    e.preventDefault();
    if (!isActive) setActivePlane(plane);
    // Arm a drag — measurement won't be created until the cursor actually
    // moves past DRAG_THRESHOLD_PX.  A bare click writes nothing.
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      started: false,
    };
    // Capture so we keep getting moves/up even if the cursor leaves the panel.
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (d.pointerId === null || d.pointerId !== e.pointerId) return;
    if (!canvasRef.current) return;
    if (!d.started) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      // First real movement — commit the start point now (using the original
      // pointerdown coordinates, not the slightly-displaced current ones) so
      // the line begins exactly where the user pressed.
      beginDragMeasurement({ clientX: d.startX, clientY: d.startY }, canvasRef.current, drawFracs);
      d.started = true;
    }
    updateDragMeasurement(e, canvasRef.current, drawFracs);
  }

  function handlePointerUp(e: React.PointerEvent) {
    e.stopPropagation();
    const d = dragRef.current;
    if (d.pointerId === e.pointerId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      // If the user pressed Shift+clicked without dragging, nothing was ever
      // written to the store — nothing to clean up.  The previously-displayed
      // measurement is intentionally preserved so a stray click doesn't wipe
      // an existing line.
      dragRef.current = { pointerId: null, startX: 0, startY: 0, started: false };
    }
  }

  return createPortal(
    <FullscreenOverlay
      $isActive={isActive}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onWheel={(e) => {
        e.stopPropagation();
        onWheel(e);
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <StyledCanvas ref={canvasRef as React.Ref<HTMLCanvasElement>} />

      <CrosshairAndDots
        cross={cross}
        axes={axes}
        adjustedDots={adjustedDots}
        distanceMm={measurement?.distanceMm ?? null}
      />

      <AnnotationOverlay plane={plane} halfSlabs={halfSlabs} />

      <PanelHeader>
        <PlaneGlyph $color={accentColor}>{PLANE_GLYPH[plane]}</PlaneGlyph>
        <PlaneLabel>
          <PlaneLabelAccent $color={accentColor}>{planeLabel.primary}</PlaneLabelAccent>
          {` · ${planeLabel.secondary}`}
        </PlaneLabel>
      </PanelHeader>

      <ButtonTray>
        <TrayButton
          large
          label="Export slice as PNG"
          onClick={() => downloadSlice(canvasRef.current, plane, idx)}
        >
          <Download size={13} />
        </TrayButton>
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
          onChange={handleScrub}
        />
      )}

      <PanelFooter $scrubVisible={scrubVisible}>
        <span>
          {footer.hint} · {footer.code} · SHIFT+DRAG · MEASURE
        </span>
        {total > 0 && (
          <SliceCounter>
            <span>{idx}</span>
            <SliceDim> / {total}</SliceDim>
          </SliceCounter>
        )}
      </PanelFooter>

      {isActive && <ActiveBorder />}

      {menu && (
        <MeasureMenu
          x={menu.screenX}
          y={menu.screenY}
          hasMeasurementFrom={measurement !== null}
          onMeasureFrom={onMeasureFrom}
          onMeasureTo={onMeasureTo}
          onSnapToView={onSnapToView}
          onClear={onClear}
          onClose={closeMenu}
        />
      )}
    </FullscreenOverlay>,
    document.body,
  );
}

// ── SlicePanel ─────────────────────────────────────────────────────────────

/** Sensitivity of touch-swipe slice navigation — pixels per full range traversal. */
const TOUCH_SWIPE_FULL_RANGE_PX = 300;

export function SlicePanel({ plane }: { plane: SlicePlane }) {
  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();
  // Slab MIP comes from the global store — controlled in the Render dock cell
  // and applied uniformly to all three rail panels + the fullscreen view.
  const slabMm = useVolumeStore((s) => s.slabMm);
  const halfSlabs = useHalfSlabs(plane, slabMm);
  const setCanvasRef = useVolumeStore((s) => s.setCanvasRef);

  const {
    canvasRef,
    drawFracs,
    idx,
    total,
    cross,
    adjustedDots,
    axes,
    accentColor,
    planeLabel,
    isActive,
    cursor,
    dims,
    scrubVisible,
    setScrubVisible,
    setCursor,
    setActivePlane,
    onWheel,
    handleScrub,
    handleContextMenu,
    onSnapToView,
    measurement,
    menu,
    onMeasureFrom,
    onMeasureTo,
    onClear,
    closeMenu,
  } = useSlicePanelCore(plane, halfSlabs);
  // Touch-swipe slice navigation — tracks gesture start state.
  const touchRef = useRef<{ startY: number; startIdx: number } | null>(null);

  // Register canvas with the store so useMcpBridge can capture it.
  useEffect(() => {
    setCanvasRef(plane, canvasRef.current);
    return () => setCanvasRef(plane, null);
  }, [plane, setCanvasRef, canvasRef]);

  const isLast = plane === 'axial';
  // On mobile the scrubber is always visible — no toggle needed.
  const scrubberVisible = isMobile || scrubVisible;

  function handleClick(e: React.MouseEvent) {
    // First click on an inactive panel just focuses it — cursor only moves on
    // subsequent clicks. Rotating the 3-D model is opt-in via the context-menu
    // "View from this side" item.
    if (!isActive) {
      setActivePlane(plane);
      return;
    }
    if (!canvasRef.current || !dims || !cursor) return;
    setCursor(cursorFromClick(e, canvasRef.current, plane, dims, cursor, drawFracs));
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (!isActive) setActivePlane(plane);
    const t = e.touches[0];
    touchRef.current = { startY: t.clientY, startIdx: idx };
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchRef.current) return;
    const t = e.touches[0];
    const dy = touchRef.current.startY - t.clientY;
    // Sensitivity: traverse full range over 300 px of swipe.
    const step = Math.round((dy / TOUCH_SWIPE_FULL_RANGE_PX) * total);
    if (step === 0) return;
    const newIdx = Math.max(1, Math.min(total, touchRef.current.startIdx + step));
    handleScrub(newIdx);
    touchRef.current = { startY: t.clientY, startIdx: newIdx };
  }

  function handleTouchEnd() {
    touchRef.current = null;
  }

  return (
    <PanelWrap
      data-testid={`slice-panel-${plane}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onWheel={onWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      $isLast={isLast}
      $isActive={isActive}
    >
      <StyledCanvas ref={canvasRef as React.Ref<HTMLCanvasElement>} />

      <CrosshairAndDots
        cross={cross}
        axes={axes}
        adjustedDots={adjustedDots}
        distanceMm={measurement?.distanceMm ?? null}
      />

      <PanelHeader>
        <PlaneGlyph $color={accentColor}>{PLANE_GLYPH[plane]}</PlaneGlyph>
        <PlaneLabel>
          <PlaneLabelAccent $color={accentColor}>{planeLabel.primary}</PlaneLabelAccent>
          {` · ${planeLabel.secondary}`}
        </PlaneLabel>
      </PanelHeader>

      {/* ── Mobile: flex-column right rail (Scrubber → Download → Counter) ── */}
      {isMobile ? (
        <MobileRightCol>
          {total > 0 && (
            <SliceScrubber
              axis={plane}
              slice={idx}
              total={total}
              visible
              inline
              onChange={handleScrub}
            />
          )}
          <TrayButton
            label="Export slice as PNG"
            onClick={() => downloadSlice(canvasRef.current, plane, idx)}
          >
            <Download size={11} />
          </TrayButton>
          {total > 0 && (
            <MobileCounter>
              {idx}
              <SliceDim> / {total}</SliceDim>
            </MobileCounter>
          )}
        </MobileRightCol>
      ) : (
        /* ── Desktop: ButtonTray (top-right) + absolute Scrubber ── */
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
              onChange={handleScrub}
            />
          )}
        </>
      )}

      <PanelFooter $scrubVisible={scrubberVisible}>
        <span>
          {PLANE_FOOTER[plane].hint} · {PLANE_FOOTER[plane].code}
        </span>
        {!isMobile && total > 0 && (
          <SliceCounter>
            <span>{idx}</span>
            <SliceDim> / {total}</SliceDim>
          </SliceCounter>
        )}
      </PanelFooter>

      {isActive && <ActiveBorder />}

      {menu && (
        <MeasureMenu
          x={menu.screenX}
          y={menu.screenY}
          hasMeasurementFrom={measurement !== null}
          onMeasureFrom={onMeasureFrom}
          onMeasureTo={onMeasureTo}
          onSnapToView={onSnapToView}
          onClear={onClear}
          onClose={closeMenu}
        />
      )}

      <AnnotationOverlay plane={plane} halfSlabs={halfSlabs} />

      {expanded && <ExpandedSlicePanel plane={plane} onClose={() => setExpanded(false)} />}
    </PanelWrap>
  );
}
