import { MeasureMenu } from '@/components/rail/MeasureMenu';
import { SliceScrubber } from '@/components/rail/SliceScrubber';
import { Tooltip } from '@/components/ui/Tooltip';
import { PLANE_FOOTER, PLANE_GLYPH, accentRgba } from '@/constants';
import { useIsMobile } from '@/hooks/useIsMobile';
import { axisColor, axisGlow, cursorFromClick, useSlicePanelCore } from '@/hooks/useSlicePanelCore';
import { useVolumeStore } from '@/store';
import type { SlicePlane } from '@/types';
import { ChevronsUpDown, Download, Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

// ── Tuning knobs ──────────────────────────────────────────────────────────

/** Fixed pixel size of measurement dots on 2-D slice panels. */
const MEASURE_DOT_PX = 8;

// ── Styled components ──────────────────────────────────────────────────────

const PanelWrap = styled.div<{ $isLast: boolean; $isActive: boolean }>`
  position: relative;
  flex: 1;
  min-height: 0;
  background: #050403;
  border-bottom: ${({ $isLast }) => ($isLast ? 'none' : '1px solid var(--rule)')};
  overflow: hidden;
  cursor: ${({ $isActive }) => ($isActive ? 'crosshair' : 'pointer')};
  touch-action: none;
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

const CrossH = styled.div<{ $color: string; $glow: string }>`
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: ${({ $color }) => $color};
  opacity: 0.7;
  box-shadow: 0 0 4px ${({ $glow }) => $glow};
`;

const CrossV = styled.div<{ $color: string; $glow: string }>`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: ${({ $color }) => $color};
  opacity: 0.7;
  box-shadow: 0 0 4px ${({ $glow }) => $glow};
`;

const CrossCenter = styled.div`
  position: absolute;
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
  margin-right: 3px;
`;

const SliceDim = styled.span`
  color: var(--ink-3);
`;

const PanelFooter = styled.div<{ $scrubVisible: boolean }>`
  position: absolute;
  bottom: 8px;
  left: 14px;
  right: ${({ $scrubVisible }) => ($scrubVisible ? '48px' : '14px')};
  z-index: 4;
  display: flex;
  justify-content: space-between;
  font-family: var(--mono);
  font-size: 9.5px;
  color: var(--ink-3);
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

const MeasureLine = styled.svg`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 6;
  overflow: visible;
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
  gap: 7px;
  pointer-events: auto;
`;

/**
 * Mobile-only right column: stacks Scrubber → Eye icon → Counter
 * using flex-column + gap so no pixel math is needed.
 */
const MobileRightCol = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 46px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 18px 6px 18px 4px;
  background: linear-gradient(to left, rgba(10, 8, 5, 0.85), transparent 70%);
  pointer-events: none;
`;

const MobileCounter = styled.span`
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  flex-shrink: 0;
  pointer-events: none;
`;

const TrayBtn = styled.button<{ $active?: boolean; $hover: boolean; $large?: boolean }>`
  width: ${({ $large }) => ($large ? '36px' : '24px')};
  height: ${({ $large }) => ($large ? '36px' : '24px')};
  flex-shrink: 0;
  border-radius: ${({ $large }) => ($large ? '6px' : '3px')};
  border: 1px solid
    ${({ $active, $hover }) =>
      $active ? 'var(--amber-dim)' : $hover ? 'var(--rule-2)' : 'var(--rule)'};
  background: ${({ $active }) => ($active ? accentRgba('amber', 0.08) : 'rgba(15,13,10,0.90)')};
  color: ${({ $active, $hover }) =>
    $active ? 'var(--amber)' : $hover ? 'var(--ink)' : 'var(--ink-3)'};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;

  @media (max-width: 767px) {
    width: 36px;
    height: 36px;
    border-radius: 6px;
  }
`;

const SlabBar = styled.div`
  position: absolute;
  bottom: 36px;
  left: 14px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
`;

const SlabLabel = styled.span`
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-3);
`;

const SlabBtn = styled.button<{ $active: boolean }>`
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  padding: 5px 10px;
  border-radius: 4px;
  border: 1px solid
    ${({ $active }) => ($active ? 'var(--amber-dim)' : 'var(--rule)')};
  background: ${({ $active }) => ($active ? '#3a2a0a' : '#1a1710')};
  color: ${({ $active }) => ($active ? 'var(--amber)' : 'var(--ink-3)')};
  cursor: pointer;
  transition:
    background 80ms,
    border-color 80ms,
    color 80ms;

  ${({ $active }) =>
    !$active &&
    `
    &:hover {
      background: #232017;
      border-color: var(--rule-2);
      color: var(--ink);
    }
  `}
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
        $large={large}
      >
        {children}
      </TrayBtn>
    </Tooltip>
  );
}

// ── Shared crosshair + measurement overlay ─────────────────────────────────

function CrosshairAndDots({
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
            stroke="#ff4500"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            opacity="0.75"
            filter="drop-shadow(0 0 4px rgba(255,69,0,0.5))"
          />
        </MeasureLine>
      )}
      {adjustedDots.map((dot, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable index for static measurement dots
        <MeasureDot key={i} $fx={dot.fx} $fy={dot.fy} $size={MEASURE_DOT_PX} />
      ))}
    </>
  );
}

// ── ExpandedSlicePanel ──────────────────────────────────────────────────────

/** Slab thickness presets: [label, mm] — 0 = off */
const SLAB_PRESETS: Array<[string, number]> = [
  ['Off', 0],
  ['3 mm', 3],
  ['5 mm', 5],
  ['10 mm', 10],
];

function ExpandedSlicePanel({
  plane,
  onClose,
}: {
  plane: SlicePlane;
  onClose: () => void;
}) {
  const [slabMm, setSlabMm] = useState(0);
  const spacing = useVolumeStore((s) => s.volume?.meta.spacing);

  /** Half-slab in slices — converts mm thickness to slice count for this plane. */
  const halfSlabs = useMemo(() => {
    if (!spacing || slabMm === 0) return 0;
    const mmPerSlice =
      plane === 'axial' ? spacing[2] : plane === 'coronal' ? spacing[1] : spacing[0];
    return Math.max(1, Math.round(slabMm / 2 / mmPerSlice));
  }, [slabMm, spacing, plane]);

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
    requestSnapToView,
    onWheel,
    handleScrub,
    handleContextMenu,
    measurement,
    menu,
    onMeasureFrom,
    onMeasureTo,
    onClear,
    closeMenu,
  } = useSlicePanelCore(plane, halfSlabs);

  const footer = PLANE_FOOTER[plane];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isActive) {
      requestSnapToView(plane);
      return;
    }
    if (!canvasRef.current || !dims || !cursor) return;
    setCursor(cursorFromClick(e, canvasRef.current, plane, dims, cursor, drawFracs));
  }

  function handleWheel(e: React.WheelEvent) {
    e.stopPropagation();
    onWheel(e);
  }

  function downloadSlice() {
    const canvas = canvasRef.current;
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

  return createPortal(
    <FullscreenOverlay
      $isActive={isActive}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
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

      <ButtonTray>
        <TrayButton large label="Export slice as PNG" onClick={downloadSlice}>
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

      <SlabBar>
        <SlabLabel>Slab MIP</SlabLabel>
        {SLAB_PRESETS.map(([label, mm]) => (
          <SlabBtn
            key={label}
            type="button"
            $active={slabMm === mm}
            onClick={(e) => {
              e.stopPropagation();
              setSlabMm(mm);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {label}
          </SlabBtn>
        ))}
      </SlabBar>

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
          onClear={onClear}
          onClose={closeMenu}
        />
      )}
    </FullscreenOverlay>,
    document.body,
  );
}

// ── SlicePanel ─────────────────────────────────────────────────────────────

export function SlicePanel({ plane }: { plane: SlicePlane }) {
  const [expanded, setExpanded] = useState(false);
  const [slabMm, setSlabMm] = useState(0);
  const isMobile = useIsMobile();
  const spacing = useVolumeStore((s) => s.volume?.meta.spacing);

  const halfSlabs = useMemo(() => {
    if (!spacing || slabMm === 0) return 0;
    const mmPerSlice =
      plane === 'axial' ? spacing[2] : plane === 'coronal' ? spacing[1] : spacing[0];
    return Math.max(1, Math.round(slabMm / 2 / mmPerSlice));
  }, [slabMm, spacing, plane]);

  // On mobile, slab is controlled from the regular panel (no expand mode).
  // On desktop, slab is only available in ExpandedSlicePanel.
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
    requestSnapToView,
    onWheel,
    handleScrub,
    handleContextMenu,
    measurement,
    menu,
    onMeasureFrom,
    onMeasureTo,
    onClear,
    closeMenu,
  } = useSlicePanelCore(plane, isMobile ? halfSlabs : 0);
  // Touch-swipe slice navigation — tracks gesture start state.
  const touchRef = useRef<{ startY: number; startIdx: number } | null>(null);

  const isLast = plane === 'axial';
  // On mobile the scrubber is always visible — no toggle needed.
  const scrubberVisible = isMobile || scrubVisible;

  function handleClick(e: React.MouseEvent) {
    if (!isActive) {
      requestSnapToView(plane);
      return;
    }
    if (!canvasRef.current || !dims || !cursor) return;
    setCursor(cursorFromClick(e, canvasRef.current, plane, dims, cursor, drawFracs));
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (!isActive) requestSnapToView(plane);
    const t = e.touches[0];
    touchRef.current = { startY: t.clientY, startIdx: idx };
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchRef.current) return;
    const t = e.touches[0];
    const dy = touchRef.current.startY - t.clientY;
    // Sensitivity: traverse full range over 300 px of swipe.
    const step = Math.round((dy / 300) * total);
    if (step === 0) return;
    const newIdx = Math.max(1, Math.min(total, touchRef.current.startIdx + step));
    handleScrub(newIdx);
    touchRef.current = { startY: t.clientY, startIdx: newIdx };
  }

  function handleTouchEnd() {
    touchRef.current = null;
  }

  function downloadSlice() {
    const canvas = canvasRef.current;
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

  return (
    <PanelWrap
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
        <>
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
            <TrayButton label="Export slice as PNG" onClick={downloadSlice}>
              <Download size={11} />
            </TrayButton>
            {total > 0 && (
              <MobileCounter>
                {idx}
                <SliceDim> / {total}</SliceDim>
              </MobileCounter>
            )}
          </MobileRightCol>
          <SlabBar>
            <SlabLabel>Slab MIP</SlabLabel>
            {SLAB_PRESETS.map(([label, mm]) => (
              <SlabBtn
                key={label}
                type="button"
                $active={slabMm === mm}
                onClick={(e) => {
                  e.stopPropagation();
                  setSlabMm(mm);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {label}
              </SlabBtn>
            ))}
          </SlabBar>
        </>
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
          onClear={onClear}
          onClose={closeMenu}
        />
      )}

      {expanded && <ExpandedSlicePanel plane={plane} onClose={() => setExpanded(false)} />}
    </PanelWrap>
  );
}
