import { useEffect, useMemo, useRef } from "react";
import styled from "styled-components";
import { useVolumeStore } from "@/store";
import {
  useSliceImage,
  useSliceScroll,
  useMeasurementInteraction,
} from "@/hooks";
import {
  ACCENT_VAR,
  AXIS_ACCENT,
  type Axis,
  accentRgba,
  PLANE_ACCENT,
  PLANE_FOOTER,
  PLANE_GLYPH,
  PLANE_LABEL,
} from "@/constants";
import { clamp } from "@/lib/volume/math";
import {
  SliceScrubber,
  SliceScrubberToggle,
} from "@/components/rail/SliceScrubber";
import type { SlicePlane, VolumeCursor } from "@/types";
import { MeasureMenu } from "@/components/rail/MeasureMenu";

// ── Tuning knobs ──────────────────────────────────────────────────────────

/** Fixed pixel size of measurement dots on 2-D slice panels. */
const MEASURE_DOT_PX = 8;

// ── Helpers ────────────────────────────────────────────────────────────────

function sliceIndexInfo(
  plane: SlicePlane,
  dims: readonly [number, number, number] | undefined,
  cursor: VolumeCursor | null,
) {
  if (!dims || !cursor) return { idx: 0, total: 0 };
  if (plane === "coronal") return { idx: cursor.y + 1, total: dims[1] };
  if (plane === "sagittal") return { idx: cursor.x + 1, total: dims[0] };
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
  if (plane === "coronal") {
    return {
      fx: c.x / Math.max(1, w - 1),
      fy: (d - 1 - c.z) / Math.max(1, d - 1),
    };
  }
  if (plane === "sagittal") {
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
  if (plane === "coronal") return { v: "y", h: "z" };
  if (plane === "sagittal") return { v: "x", h: "z" };
  return { v: "x", h: "y" };
}

// ── Styled components ──────────────────────────────────────────────────────

const PanelWrap = styled.div<{ $isLast: boolean }>`
  position: relative;
  flex: 1;
  background: #050403;
  border-bottom: ${({ $isLast }) =>
    $isLast ? "none" : "1px solid var(--rule)"};
  overflow: hidden;
  cursor: crosshair;
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
  padding: 0 14px;
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

const PanelFooter = styled.div`
  position: absolute;
  bottom: 8px;
  left: 14px;
  right: 14px;
  z-index: 4;
  display: flex;
  justify-content: space-between;
  font-family: var(--mono);
  font-size: 9.5px;
  color: var(--ink-4);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  pointer-events: none;
`;

const ActiveBorder = styled.div`
  position: absolute;
  inset: 0;
  z-index: 5;
  border: 1.5px solid var(--amber);
  pointer-events: none;
  box-shadow: inset 0 0 0 1px ${accentRgba("amber", 0.15)};
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

// ── Component ──────────────────────────────────────────────────────────────

export function SlicePanel({ plane }: { plane: SlicePlane }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreen = useRef<HTMLCanvasElement | null>(null);
  const activePlane = useVolumeStore((s) => s.activePlane);
  const setActivePlane = useVolumeStore((s) => s.setActivePlane);
  const setCursor = useVolumeStore((s) => s.setCursor);
  const dims = useVolumeStore((s) => s.volume?.meta.dims);
  const cursor = useVolumeStore((s) => s.cursor);
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
  const isLast = plane === "axial";

  const cross = useMemo(() => {
    if (!dims || !cursor) return null;
    return crosshairFrac(plane, dims, cursor);
  }, [plane, dims, cursor]);

  const axes = crosshairAxes(plane);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cw = Math.max(1, Math.floor(rect.width * dpr));
    const ch = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#080604";
    ctx.fillRect(0, 0, cw, ch);
    if (!image) return;

    if (!offscreen.current)
      offscreen.current = document.createElement("canvas");
    const off = offscreen.current;
    off.width = image.width;
    off.height = image.height;
    const octx = off.getContext("2d");
    if (!octx) return;
    octx.putImageData(
      new ImageData(
        image.data as Uint8ClampedArray<ArrayBuffer>,
        image.width,
        image.height,
      ),
      0,
      0,
    );
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(off, 0, 0, cw, ch);
  }, [image]);

  function handleClick(e: React.MouseEvent) {
    setActivePlane(plane);
    const canvas = canvasRef.current;
    if (!canvas || !dims || !cursor) return;
    const rect = canvas.getBoundingClientRect();
    const fx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const fy = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const [w, h, d] = dims;
    const next: VolumeCursor = { ...cursor };
    if (plane === "coronal") {
      next.x = Math.round(fx * (w - 1));
      next.z = Math.round((1 - fy) * (d - 1));
    } else if (plane === "sagittal") {
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
    if (plane === "coronal") setCursor({ ...cursor, y: i });
    else if (plane === "sagittal") setCursor({ ...cursor, x: i });
    else setCursor({ ...cursor, z: i });
  }

  const handleScrubToggle = () => setScrubVisible(plane, !scrubVisible);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setActivePlane(plane);
    if (canvasRef.current) openMenu(e, canvasRef.current);
  }

  const accentColor = PLANE_ACCENT[plane];
  const [labelPrimary, labelSecondary] = PLANE_LABEL[plane].split(" · ");

  return (
    <PanelWrap
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onWheel={onWheel}
      $isLast={isLast}
    >
      <StyledCanvas ref={canvasRef} />
      {cross && (
        <CrosshairOverlay>
          <CrossH
            $top={cross.fy * 100}
            $color={axisColor(axes.h)}
            $glow={axisGlow(axes.h)}
          />
          <CrossV
            $left={cross.fx * 100}
            $color={axisColor(axes.v)}
            $glow={axisGlow(axes.v)}
          />
          <CrossCenter $left={cross.fx * 100} $top={cross.fy * 100}>
            <CrossDot />
          </CrossCenter>
        </CrosshairOverlay>
      )}
      <PanelHeader>
        <PlaneGlyph $color={accentColor}>{PLANE_GLYPH[plane]}</PlaneGlyph>
        <PlaneLabel>
          <PlaneLabelAccent $color={accentColor}>
            {labelPrimary}
          </PlaneLabelAccent>
          {` · ${labelSecondary}`}
        </PlaneLabel>
        <SliceCounter>
          <span className="cur">{total ? idx : "—"}</span>
          <SliceDim>{total ? ` / ${total}` : ""}</SliceDim>
        </SliceCounter>
        {total > 0 && (
          <SliceScrubberToggle
            active={scrubVisible}
            onToggle={handleScrubToggle}
          />
        )}
      </PanelHeader>
      {total > 0 && (
        <SliceScrubber
          axis={plane}
          slice={idx}
          total={total}
          visible={scrubVisible}
          onChange={handleScrub}
        />
      )}
      <PanelFooter>
        <span>{footer.hint}</span>
        <span>{footer.code}</span>
      </PanelFooter>
      {measureDots.map((dot, i) => (
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
    </PanelWrap>
  );
}
