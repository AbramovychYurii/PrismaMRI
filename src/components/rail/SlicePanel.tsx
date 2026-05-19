import { MeasureMenu } from '@/components/rail/MeasureMenu';
import { SliceScrubber } from '@/components/rail/SliceScrubber';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  ACCENT_VAR,
  AXIS_ACCENT,
  type Axis,
  PLANE_ACCENT,
  PLANE_FOOTER,
  PLANE_GLYPH,
  PLANE_LABEL,
  accentRgba,
} from '@/constants';
import { useMeasurementInteraction, useSliceImage, useSliceScroll } from '@/hooks';
import type { DrawFracs } from '@/hooks/useMeasurementInteraction';
import { clamp } from '@/lib/volume/math';
import { useVolumeStore } from '@/store';
import type { SlicePlane, VolumeCursor } from '@/types';
import { ChevronsUpDown, Eye, Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

// ── Tuning knobs ──────────────────────────────────────────────────────────

/** Fixed pixel size of measurement dots on 2-D slice panels. */
const MEASURE_DOT_PX = 8;

// ── Physical aspect helpers ────────────────────────────────────────────────

function physicalAspect(
  plane: SlicePlane,
  dims: readonly [number, number, number],
  spacing: readonly [number, number, number],
): number {
  const [sx, sy, sz] = spacing;
  const [w, h, d] = dims;
  if (plane === 'coronal') return (w * sx) / (d * sz);
  if (plane === 'sagittal') return (h * sy) / (d * sz);
  return (w * sx) / (h * sy);
}

/** Returns the letterboxed image rect as panel-space fractions. */
function computeDrawFracs(physAspect: number, cw: number, ch: number): DrawFracs {
  if (physAspect >= cw / ch) {
    const drawH = cw / physAspect;
    return { xF: 0, yF: (ch - drawH) / 2 / ch, wF: 1, hF: drawH / ch };
  }
  const drawW = ch * physAspect;
  return { xF: (cw - drawW) / 2 / cw, yF: 0, wF: drawW / cw, hF: 1 };
}

function imageToPanel(imgFx: number, imgFy: number, df: DrawFracs) {
  return { fx: df.xF + imgFx * df.wF, fy: df.yF + imgFy * df.hF };
}

function panelToImage(panelFx: number, panelFy: number, df: DrawFracs) {
  return {
    fx: clamp((panelFx - df.xF) / df.wF, 0, 1),
    fy: clamp((panelFy - df.yF) / df.hF, 0, 1),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sliceIndexInfo(
  plane: SlicePlane,
  dims: readonly [number, number, number] | undefined,
  cursor: VolumeCursor | null,
) {
  if (!dims || !cursor) return { idx: 0, total: 0 };
  if (plane === 'coronal') return { idx: cursor.y + 1, total: dims[1] };
  if (plane === 'sagittal') return { idx: cursor.x + 1, total: dims[0] };
  return { idx: cursor.z + 1, total: dims[2] };
}

/**
 * Crosshair position as 0..1 fractions of the (stretched) slice image.
 * Coronal/Sagittal render z reversed (row 0 = z=depth-1).
 */
function crosshairFrac(
  plane: SlicePlane,
  dims: readonly [number, number, number],
  c: VolumeCursor,
): { fx: number; fy: number } {
  const [w, h, d] = dims;
  if (plane === 'coronal') {
    return {
      fx: c.x / Math.max(1, w - 1),
      fy: (d - 1 - c.z) / Math.max(1, d - 1),
    };
  }
  if (plane === 'sagittal') {
    return {
      fx: c.y / Math.max(1, h - 1),
      fy: (d - 1 - c.z) / Math.max(1, d - 1),
    };
  }
  return { fx: c.x / Math.max(1, w - 1), fy: c.y / Math.max(1, h - 1) };
}

const axisColor = (a: Axis) => ACCENT_VAR[AXIS_ACCENT[a]];
const axisGlow = (a: Axis) => accentRgba(AXIS_ACCENT[a], 0.45);

/**
 * Which axis each crosshair line represents on a panel — the vertical line
 * carries the `fx` coordinate, the horizontal line the `fy`. Each panel shows
 * the two axes orthogonal to its own, tinted with their system colors.
 */
function crosshairAxes(plane: SlicePlane): { v: Axis; h: Axis } {
  if (plane === 'coronal') return { v: 'y', h: 'z' };
  if (plane === 'sagittal') return { v: 'x', h: 'z' };
  return { v: 'y', h: 'x' };
}

// ── Styled components ──────────────────────────────────────────────────────

const PanelWrap = styled.div<{ $isLast: boolean; $isActive: boolean }>`
  position: relative;
  flex: 1;
  min-height: 0;
  background: #050403;
  border-bottom: ${({ $isLast }) => ($isLast ? 'none' : '1px solid var(--rule)')};
  overflow: hidden;
  cursor: ${({ $isActive }) => ($isActive ? 'crosshair' : 'pointer')};
`;

const StyledCanvas = styled.canvas`
  width: 100%;
  height: 100%;
  display: block;
`;

const CrosshairOverlay = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
`;

const CrossH = styled.div<{ $top: number; $color: string; $glow: string }>`
  position: absolute;
  left: 0;
  right: 0;
  top: ${({ $top }) => $top}%;
  height: 1px;
  background: ${({ $color }) => $color};
  opacity: 0.7;
  box-shadow: 0 0 4px ${({ $glow }) => $glow};
`;

const CrossV = styled.div<{ $left: number; $color: string; $glow: string }>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: ${({ $left }) => $left}%;
  width: 1px;
  background: ${({ $color }) => $color};
  opacity: 0.7;
  box-shadow: 0 0 4px ${({ $glow }) => $glow};
`;

const CrossCenter = styled.div<{ $left: number; $top: number }>`
  position: absolute;
  left: ${({ $left }) => $left}%;
  top: ${({ $top }) => $top}%;
  width: 14px;
  height: 14px;
  transform: translate(-50%, -50%);
`;

const CrossDot = styled.span`
  position: absolute;
  inset: 4px;
  border: 1px solid var(--teal);
  border-radius: 99px;
  opacity: 0.7;
`;

const PanelHeader = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 62px 0 14px;
  background: linear-gradient(
    to bottom,
    rgba(8, 7, 5, 0.92),
    rgba(8, 7, 5, 0.55) 70%,
    transparent
  );
  z-index: 4;
  gap: 12px;
  min-width: 0;
`;

const PlaneGlyph = styled.span<{ $color: string }>`
  font-family: var(--serif);
  font-style: italic;
  font-size: 18px;
  line-height: 1;
  font-weight: 500;
  color: ${({ $color }) => $color};
`;

const PlaneLabel = styled.span`
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-2);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`;

const PlaneLabelAccent = styled.b<{ $color: string }>`
  font-weight: 600;
  color: ${({ $color }) => $color};
`;

const SliceCounter = styled.span`
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  flex-shrink: 0;
`;

const SliceDim = styled.span`
  color: var(--ink-4);
`;

const PanelFooter = styled.div<{ $scrubVisible: boolean }>`
  position: absolute;
  bottom: 8px;
  left: 14px;
  right: ${({ $scrubVisible }) => ($scrubVisible ? '46px' : '14px')};
  z-index: 4;
  display: flex;
  justify-content: space-between;
  font-family: var(--mono);
  font-size: 9.5px;
  color: var(--ink-4);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  pointer-events: none;
  transition: right 160ms ease;
`;

const ActiveBorder = styled.div`
  position: absolute;
  inset: 0;
  z-index: 5;
  border: 1.5px solid var(--amber);
  pointer-events: none;
  box-shadow: inset 0 0 0 1px ${accentRgba('amber', 0.15)};
`;

const MeasureDot = styled.div<{ $fx: number; $fy: number; $size: number }>`
  position: absolute;
  left: ${({ $fx }) => $fx * 100}%;
  top: ${({ $fy }) => $fy * 100}%;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: #ff4500;
  box-shadow:
    0 0 ${({ $size }) => $size * 0.7}px #ff4500,
    0 0 ${({ $size }) => $size * 1.6}px rgba(255, 69, 0, 0.45);
  pointer-events: none;
  z-index: 6;
`;

const ButtonTray = styled.div`
  position: absolute;
  top: 5px;
  right: 8px;
  z-index: 6;
  display: flex;
  gap: 4px;
  pointer-events: auto;
`;

const TrayBtn = styled.button<{ $active?: boolean; $hover: boolean }>`
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 3px;
  border: 1px solid
    ${({ $active, $hover }) =>
      $active ? 'var(--amber-dim)' : $hover ? 'var(--rule-2)' : 'var(--rule)'};
  background: ${({ $active }) => ($active ? accentRgba('amber', 0.08) : 'transparent')};
  color: ${({ $active, $hover }) =>
    $active ? 'var(--amber)' : $hover ? 'var(--ink)' : 'var(--ink-3)'};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
`;

const FullscreenOverlay = styled.div<{ $isActive: boolean }>`
  position: fixed;
  top: 56px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  background: #050403;
  overflow: hidden;
  cursor: ${({ $isActive }) => ($isActive ? 'crosshair' : 'default')};
`;

// ── TrayButton ─────────────────────────────────────────────────────────────

function TrayButton({
  label,
  active,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
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
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        $active={active}
        $hover={hover}
      >
        {children}
      </TrayBtn>
    </Tooltip>
  );
}

// ── ExpandedSlicePanel ──────────────────────────────────────────────────────

function ExpandedSlicePanel({
  plane,
  onClose,
}: {
  plane: SlicePlane;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreen = useRef<HTMLCanvasElement | null>(null);
  const activePlane = useVolumeStore((s) => s.activePlane);
  const setActivePlane = useVolumeStore((s) => s.setActivePlane);
  const setCursor = useVolumeStore((s) => s.setCursor);
  const requestSnapToView = useVolumeStore((s) => s.requestSnapToView);
  const dims = useVolumeStore((s) => s.volume?.meta.dims);
  const spacing = useVolumeStore((s) => s.volume?.meta.spacing);
  const cursor = useVolumeStore((s) => s.cursor);
  const scrubVisible = useVolumeStore((s) => s.scrubVisible[plane]);
  const setScrubVisible = useVolumeStore((s) => s.setScrubVisible);
  const [canvasSize, setCanvasSize] = useState({ w: 1, h: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setCanvasSize({ w: Math.max(1, width), h: Math.max(1, height) });
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const drawFracs = useMemo<DrawFracs | null>(() => {
    if (!dims || !spacing) return null;
    return computeDrawFracs(physicalAspect(plane, dims, spacing), canvasSize.w, canvasSize.h);
  }, [plane, dims, spacing, canvasSize]);

  const {
    measurement,
    measureDots,
    menu,
    openMenu,
    closeMenu,
    onMeasureFrom,
    onMeasureTo,
    onClear,
  } = useMeasurementInteraction(plane, dims, cursor);

  const image = useSliceImage(plane);
  const onWheel = useSliceScroll(plane);

  const isActive = activePlane === plane;
  const { idx, total } = sliceIndexInfo(plane, dims, cursor);
  const footer = PLANE_FOOTER[plane];

  const cross = useMemo(() => {
    if (!dims || !cursor) return null;
    const imgFrac = crosshairFrac(plane, dims, cursor);
    if (!drawFracs) return imgFrac;
    return imageToPanel(imgFrac.fx, imgFrac.fy, drawFracs);
  }, [plane, dims, cursor, drawFracs]);

  const adjustedDots = useMemo(
    () => (drawFracs ? measureDots.map((d) => imageToPanel(d.fx, d.fy, drawFracs)) : measureDots),
    [measureDots, drawFracs],
  );

  const axes = crosshairAxes(plane);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.floor(canvasSize.w * dpr));
    const ch = Math.max(1, Math.floor(canvasSize.h * dpr));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#080604';
    ctx.fillRect(0, 0, cw, ch);
    if (!image) return;
    if (!offscreen.current) offscreen.current = document.createElement('canvas');
    const off = offscreen.current;
    off.width = image.width;
    off.height = image.height;
    const octx = off.getContext('2d');
    if (!octx) return;
    octx.putImageData(
      new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
      0,
      0,
    );
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (drawFracs) {
      ctx.drawImage(
        off,
        drawFracs.xF * cw,
        drawFracs.yF * ch,
        drawFracs.wF * cw,
        drawFracs.hF * ch,
      );
    } else {
      ctx.drawImage(off, 0, 0, cw, ch);
    }
  }, [image, drawFracs, canvasSize]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isActive) {
      setActivePlane(plane);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || !dims || !cursor) return;
    const rect = canvas.getBoundingClientRect();
    const panelFx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const panelFy = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const { fx, fy } = drawFracs
      ? panelToImage(panelFx, panelFy, drawFracs)
      : { fx: panelFx, fy: panelFy };
    const [w, h, d] = dims;
    const next: VolumeCursor = { ...cursor };
    if (plane === 'coronal') {
      next.x = Math.round(fx * (w - 1));
      next.z = Math.round((1 - fy) * (d - 1));
    } else if (plane === 'sagittal') {
      next.y = Math.round(fx * (h - 1));
      next.z = Math.round((1 - fy) * (d - 1));
    } else {
      next.x = Math.round(fx * (w - 1));
      next.y = Math.round(fy * (h - 1));
    }
    setCursor(next);
  }

  function handleScrub(nextSlice: number) {
    if (!cursor) return;
    const i = nextSlice - 1;
    if (plane === 'coronal') setCursor({ ...cursor, y: i });
    else if (plane === 'sagittal') setCursor({ ...cursor, x: i });
    else setCursor({ ...cursor, z: i });
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setActivePlane(plane);
    if (canvasRef.current) openMenu(e, canvasRef.current, drawFracs);
  }

  function handleWheel(e: React.WheelEvent) {
    e.stopPropagation();
    onWheel(e);
  }

  function handlePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
  }

  function handlePointerUp(e: React.PointerEvent) {
    e.stopPropagation();
  }

  const accentColor = PLANE_ACCENT[plane];
  const [labelPrimary, labelSecondary] = PLANE_LABEL[plane].split(' · ');

  return createPortal(
    <FullscreenOverlay
      $isActive={isActive}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <StyledCanvas ref={canvasRef} />
      {cross && (
        <CrosshairOverlay>
          <CrossH $top={cross.fy * 100} $color={axisColor(axes.h)} $glow={axisGlow(axes.h)} />
          <CrossV $left={cross.fx * 100} $color={axisColor(axes.v)} $glow={axisGlow(axes.v)} />
          <CrossCenter $left={cross.fx * 100} $top={cross.fy * 100}>
            <CrossDot />
          </CrossCenter>
        </CrosshairOverlay>
      )}
      <PanelHeader>
        <PlaneGlyph $color={accentColor}>{PLANE_GLYPH[plane]}</PlaneGlyph>
        <PlaneLabel>
          <PlaneLabelAccent $color={accentColor}>{labelPrimary}</PlaneLabelAccent>
          {` · ${labelSecondary}`}
        </PlaneLabel>
      </PanelHeader>
      <ButtonTray>
        <TrayButton label="Align 3D view to this plane" onClick={() => requestSnapToView(plane)}>
          <Eye size={11} />
        </TrayButton>
        <TrayButton label="Collapse panel" onClick={onClose}>
          <Minimize2 size={11} />
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
      {adjustedDots.map((dot, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable index for static measurement dots
        <MeasureDot key={i} $fx={dot.fx} $fy={dot.fy} $size={MEASURE_DOT_PX} />
      ))}
      {isActive && <ActiveBorder />}
      {menu && (
        <MeasureMenu
          x={menu.screenX}
          y={menu.screenY}
          hasMeasurementFrom={measurement !== null}
          onMeasureFrom={onMeasureFrom}
          onMeasureTo={onMeasureTo}
          onClear={onClear}
          onClose={closeMenu}
        />
      )}
    </FullscreenOverlay>,
    document.body,
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function SlicePanel({ plane }: { plane: SlicePlane }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreen = useRef<HTMLCanvasElement | null>(null);
  const activePlane = useVolumeStore((s) => s.activePlane);
  const setActivePlane = useVolumeStore((s) => s.setActivePlane);
  const setCursor = useVolumeStore((s) => s.setCursor);
  const requestSnapToView = useVolumeStore((s) => s.requestSnapToView);
  const dims = useVolumeStore((s) => s.volume?.meta.dims);
  const spacing = useVolumeStore((s) => s.volume?.meta.spacing);
  const cursor = useVolumeStore((s) => s.cursor);
  const [canvasSize, setCanvasSize] = useState({ w: 1, h: 1 });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setCanvasSize({ w: Math.max(1, width), h: Math.max(1, height) });
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const drawFracs = useMemo<DrawFracs | null>(() => {
    if (!dims || !spacing) return null;
    return computeDrawFracs(physicalAspect(plane, dims, spacing), canvasSize.w, canvasSize.h);
  }, [plane, dims, spacing, canvasSize]);
  const scrubVisible = useVolumeStore((s) => s.scrubVisible[plane]);
  const setScrubVisible = useVolumeStore((s) => s.setScrubVisible);
  const {
    measurement,
    measureDots,
    menu,
    openMenu,
    closeMenu,
    onMeasureFrom,
    onMeasureTo,
    onClear,
  } = useMeasurementInteraction(plane, dims, cursor);

  const image = useSliceImage(plane);
  const onWheel = useSliceScroll(plane);

  const isActive = activePlane === plane;
  const { idx, total } = sliceIndexInfo(plane, dims, cursor);
  const footer = PLANE_FOOTER[plane];
  const isLast = plane === 'axial';

  const cross = useMemo(() => {
    if (!dims || !cursor) return null;
    const imgFrac = crosshairFrac(plane, dims, cursor);
    if (!drawFracs) return imgFrac;
    return imageToPanel(imgFrac.fx, imgFrac.fy, drawFracs);
  }, [plane, dims, cursor, drawFracs]);

  const adjustedDots = useMemo(
    () => (drawFracs ? measureDots.map((d) => imageToPanel(d.fx, d.fy, drawFracs)) : measureDots),
    [measureDots, drawFracs],
  );

  const axes = crosshairAxes(plane);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.floor(canvasSize.w * dpr));
    const ch = Math.max(1, Math.floor(canvasSize.h * dpr));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#080604';
    ctx.fillRect(0, 0, cw, ch);
    if (!image) return;

    if (!offscreen.current) offscreen.current = document.createElement('canvas');
    const off = offscreen.current;
    off.width = image.width;
    off.height = image.height;
    const octx = off.getContext('2d');
    if (!octx) return;
    octx.putImageData(
      new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
      0,
      0,
    );
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (drawFracs) {
      ctx.drawImage(
        off,
        drawFracs.xF * cw,
        drawFracs.yF * ch,
        drawFracs.wF * cw,
        drawFracs.hF * ch,
      );
    } else {
      ctx.drawImage(off, 0, 0, cw, ch);
    }
  }, [image, drawFracs, canvasSize]);

  function handleClick(e: React.MouseEvent) {
    if (!isActive) {
      setActivePlane(plane);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || !dims || !cursor) return;
    const rect = canvas.getBoundingClientRect();
    const panelFx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const panelFy = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const { fx, fy } = drawFracs
      ? panelToImage(panelFx, panelFy, drawFracs)
      : { fx: panelFx, fy: panelFy };
    const [w, h, d] = dims;
    const next: VolumeCursor = { ...cursor };
    if (plane === 'coronal') {
      next.x = Math.round(fx * (w - 1));
      next.z = Math.round((1 - fy) * (d - 1));
    } else if (plane === 'sagittal') {
      next.y = Math.round(fx * (h - 1));
      next.z = Math.round((1 - fy) * (d - 1));
    } else {
      next.x = Math.round(fx * (w - 1));
      next.y = Math.round(fy * (h - 1));
    }
    setCursor(next);
  }

  function handleScrub(nextSlice: number) {
    if (!cursor) return;
    const i = nextSlice - 1;
    if (plane === 'coronal') setCursor({ ...cursor, y: i });
    else if (plane === 'sagittal') setCursor({ ...cursor, x: i });
    else setCursor({ ...cursor, z: i });
  }

  const handleScrubToggle = () => setScrubVisible(plane, !scrubVisible);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setActivePlane(plane);
    if (canvasRef.current) openMenu(e, canvasRef.current, drawFracs);
  }

  const accentColor = PLANE_ACCENT[plane];
  const [labelPrimary, labelSecondary] = PLANE_LABEL[plane].split(' · ');

  return (
    <PanelWrap
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onWheel={onWheel}
      $isLast={isLast}
      $isActive={isActive}
    >
      <StyledCanvas ref={canvasRef} />
      {cross && (
        <CrosshairOverlay>
          <CrossH $top={cross.fy * 100} $color={axisColor(axes.h)} $glow={axisGlow(axes.h)} />
          <CrossV $left={cross.fx * 100} $color={axisColor(axes.v)} $glow={axisGlow(axes.v)} />
          <CrossCenter $left={cross.fx * 100} $top={cross.fy * 100}>
            <CrossDot />
          </CrossCenter>
        </CrosshairOverlay>
      )}
      <PanelHeader>
        <PlaneGlyph $color={accentColor}>{PLANE_GLYPH[plane]}</PlaneGlyph>
        <PlaneLabel>
          <PlaneLabelAccent $color={accentColor}>{labelPrimary}</PlaneLabelAccent>
          {` · ${labelSecondary}`}
        </PlaneLabel>
      </PanelHeader>
      <ButtonTray>
        <TrayButton label="Align 3D view to this plane" onClick={() => requestSnapToView(plane)}>
          <Eye size={11} />
        </TrayButton>
        <TrayButton label="Expand panel" onClick={() => setExpanded(true)}>
          <Maximize2 size={11} />
        </TrayButton>
        {total > 0 && (
          <TrayButton
            label="Toggle slice scrubber"
            active={scrubVisible}
            onClick={handleScrubToggle}
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
      {adjustedDots.map((dot, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable index for static measurement dots
        <MeasureDot key={i} $fx={dot.fx} $fy={dot.fy} $size={MEASURE_DOT_PX} />
      ))}
      {isActive && <ActiveBorder />}
      {menu && (
        <MeasureMenu
          x={menu.screenX}
          y={menu.screenY}
          hasMeasurementFrom={measurement !== null}
          onMeasureFrom={onMeasureFrom}
          onMeasureTo={onMeasureTo}
          onClear={onClear}
          onClose={closeMenu}
        />
      )}
      {expanded && <ExpandedSlicePanel plane={plane} onClose={() => setExpanded(false)} />}
    </PanelWrap>
  );
}
