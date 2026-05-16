import { useEffect, useMemo, useRef } from 'react';
import { useVolumeStore } from '@/store/volumeStore';
import { useSliceImage } from '@/hooks/useSliceImage';
import { useSliceScroll } from '@/hooks/useSliceScroll';
import { PLANE_FOOTER, PLANE_GLYPH, PLANE_LABEL } from '@/constants';
import { clamp } from '@/lib/volume/math';
import { SliceScrubber, SliceScrubberToggle } from '@/components/rail/SliceScrubber';
import type { SlicePlane, VolumeCursor } from '@/types';

const ACCENT_VAR: Record<SlicePlane, string> = {
  coronal: 'var(--amber)',
  sagittal: 'var(--violet)',
  axial: 'var(--azure)',
};

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
    return { fx: c.x / Math.max(1, w - 1), fy: (d - 1 - c.z) / Math.max(1, d - 1) };
  }
  if (plane === 'sagittal') {
    return { fx: c.y / Math.max(1, h - 1), fy: (d - 1 - c.z) / Math.max(1, d - 1) };
  }
  return { fx: c.x / Math.max(1, w - 1), fy: c.y / Math.max(1, h - 1) };
}

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
  const image = useSliceImage(plane);
  const onWheel = useSliceScroll(plane);

  const isActive = activePlane === plane;
  const { idx, total } = sliceIndexInfo(plane, dims, cursor);
  const footer = PLANE_FOOTER[plane];
  const isLast = plane === 'axial';

  const cross = useMemo(() => {
    if (!dims || !cursor) return null;
    return crosshairFrac(plane, dims, cursor);
  }, [plane, dims, cursor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cw = Math.max(1, Math.floor(rect.width * dpr));
    const ch = Math.max(1, Math.floor(rect.height * dpr));
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
      new ImageData(
        image.data as Uint8ClampedArray<ArrayBuffer>,
        image.width,
        image.height,
      ),
      0,
      0,
    );
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
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

  return (
    <div
      onClick={handleClick}
      onWheel={onWheel}
      style={{
        position: 'relative',
        flex: 1,
        background: '#050403',
        borderBottom: isLast ? 'none' : '1px solid var(--rule)',
        overflow: 'hidden',
        cursor: 'crosshair',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {cross && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${cross.fy * 100}%`,
              height: 1,
              background: 'var(--teal)',
              opacity: 0.55,
              boxShadow: '0 0 4px rgba(127,209,197,0.4)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${cross.fx * 100}%`,
              width: 1,
              background: 'var(--teal)',
              opacity: 0.55,
              boxShadow: '0 0 4px rgba(127,209,197,0.4)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: `${cross.fx * 100}%`,
              top: `${cross.fy * 100}%`,
              width: 14,
              height: 14,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <span
              style={{
                position: 'absolute',
                inset: 4,
                border: '1px solid var(--teal)',
                borderRadius: 99,
                opacity: 0.7,
              }}
            />
          </div>
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          background:
            'linear-gradient(to bottom, rgba(8,7,5,0.92), rgba(8,7,5,0.55) 70%, transparent)',
          zIndex: 4,
          gap: 12,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 18,
            lineHeight: 1,
            fontWeight: 500,
            color: ACCENT_VAR[plane],
          }}
        >
          {PLANE_GLYPH[plane]}
        </span>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--ink-2)',
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          <b style={{ fontWeight: 600, color: ACCENT_VAR[plane] }}>
            {PLANE_LABEL[plane].split(' · ')[0]}
          </b>
          {` · ${PLANE_LABEL[plane].split(' · ')[1]}`}
        </span>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--ink-2)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.04em',
            flexShrink: 0,
          }}
        >
          <span className="cur">{total ? idx : '—'}</span>
          <span style={{ color: 'var(--ink-4)' }}>{total ? ` / ${total}` : ''}</span>
        </span>
        {total > 0 && (
          <SliceScrubberToggle
            active={scrubVisible}
            onToggle={() => setScrubVisible(plane, !scrubVisible)}
          />
        )}
      </div>
      {total > 0 && (
        <SliceScrubber
          axis={plane}
          slice={idx}
          total={total}
          visible={scrubVisible}
          onChange={handleScrub}
        />
      )}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 14,
          right: 14,
          zIndex: 4,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--mono)',
          fontSize: 9.5,
          color: 'var(--ink-4)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
        }}
      >
        <span>{footer.hint}</span>
        <span>{footer.code}</span>
      </div>
      {isActive && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            border: '1.5px solid var(--amber)',
            pointerEvents: 'none',
            boxShadow: 'inset 0 0 0 1px rgba(255, 181, 71, 0.15)',
          }}
        />
      )}
    </div>
  );
}
