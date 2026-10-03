/** Scan thumbnails for the PDF report, captured from the slice canvases. */

export type Capture = { data: string; ar: number };

/** JPEG quality for embedded scan thumbnails — preserves fine anatomy without exploding PDF size. */
const PREVIEW_JPEG_QUALITY = 0.88;

/**
 * Draw the same circular pin the app uses on 2-D panels — ring only, no crosshair.
 * Returns JPEG data URL + aspect ratio (height/width) of the source canvas.
 */
export function annotateCanvas(
  src: HTMLCanvasElement,
  fx: number,
  fy: number,
  hexColor: string,
): Capture {
  const off = document.createElement('canvas');
  off.width = src.width;
  off.height = src.height;
  const ctx = off.getContext('2d');
  if (!ctx) throw new Error('annotateCanvas: failed to acquire 2D context');
  ctx.drawImage(src, 0, 0);

  const px = fx * src.width;
  const py = fy * src.height;
  // Match the 24 px CSS ring scaled to canvas resolution
  const r = Math.max(src.width, src.height) * 0.038;
  const lw = Math.max(src.width, src.height) * 0.004;

  // Dark outer halo — mirrors box-shadow: 0 0 0 1px rgba(0,0,0,0.55)
  ctx.beginPath();
  ctx.arc(px, py, r + lw, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = lw;
  ctx.stroke();

  // Coloured glow (animated in the app; static here)
  ctx.shadowColor = `${hexColor}bb`;
  ctx.shadowBlur = r * 0.5;

  // Main ring
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.strokeStyle = hexColor;
  ctx.lineWidth = lw * 0.9;
  ctx.stroke();

  ctx.shadowBlur = 0;

  return { data: off.toDataURL('image/jpeg', PREVIEW_JPEG_QUALITY), ar: src.height / src.width };
}

/** Capture a canvas as-is (no annotation). Returns data + aspect ratio. */
export function captureRaw(src: HTMLCanvasElement): Capture {
  return {
    data: src.toDataURL('image/jpeg', PREVIEW_JPEG_QUALITY),
    ar: src.height / src.width,
  };
}
