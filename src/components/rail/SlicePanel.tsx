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
}: {
  cross: { fx: number; fy: number } | null;
  axes: { v: 'x' | 'y' | 'z'; h: 'x' | 'y' | 'z' };
  adjustedDots: Array<{ fx: number; fy: number }>;
}) {
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
      {adjustedDots.length === 2 && (
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
      {adjustedDots.map((dot) => (
        <MeasureDot
          key={`${dot.fx}${dot.fy}`}
          style={{
            left: `${dot.fx * 100}%`,
            top: `${dot.fy * 100}%`,
            width: `${MEASURE_DOT_PX}px`,
            height: `${MEASURE_DOT_PX}px`,
            boxShadow: MEASURE_DOT_SHADOW,
          }}
        />
      ))}
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
  } = useSlicePanelCore(plane, halfSlabs);

  const footer = PLANE_FOOTER[plane];

  // Expanding a panel auto-focuses it — first click should move the cursor
  // immediately, not just focus an already-fullscreen view.
  useEffect(() => {
    setActivePlane(plane);
  }, [plane, setActivePlane]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
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

  return createPortal(
    <FullscreenOverlay
      $isActive={isActive}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onWheel={(e) => {
        e.stopPropagation();
        onWheel(e);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <StyledCanvas ref={canvasRef as React.Ref<HTMLCanvasElement>} />

      <CrosshairAndDots cross={cross} axes={axes} adjustedDots={adjustedDots} />

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
          {footer.hint} · {footer.code}
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

      <CrosshairAndDots cross={cross} axes={axes} adjustedDots={adjustedDots} />

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
