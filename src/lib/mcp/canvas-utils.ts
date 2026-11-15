/**
 * Canvas + image-encoding helpers used by the MCP bridge.
 *
 * Pure — no React, no Zustand. Safe to call from anywhere that has access
 * to a canvas element or raw RGBA pixels.
 */

import { MCP_JPEG_QUALITY, MCP_MAX_EDGE } from './constants';

interface GrayImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire a 2D canvas context');
  return { canvas, ctx };
}

function jpegBase64(canvas: HTMLCanvasElement, quality = MCP_JPEG_QUALITY): string {
  return canvas.toDataURL('image/jpeg', quality).replace(/^data:[^;]+;base64,/, '');
}

function imageToCanvas(image: GrayImage): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(image.width, image.height);
  ctx.putImageData(
    new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
    0,
    0,
  );
  return canvas;
}

/**
 * Downscale a canvas so its longest edge is at most MCP_MAX_EDGE, then encode
 * as JPEG. Keeps every image well under 1 MB after base64 encoding.
 */
export function encodeForMcp(src: HTMLCanvasElement, quality = MCP_JPEG_QUALITY): string {
  const scale = Math.min(1, MCP_MAX_EDGE / Math.max(src.width, src.height));
  const { canvas, ctx } = createCanvas(
    Math.max(1, Math.round(src.width * scale)),
    Math.max(1, Math.round(src.height * scale)),
  );
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return jpegBase64(canvas, quality);
}

/** Captures a canvas (with MCP-friendly downscale + JPEG encoding). */
export function captureCanvas(canvas: HTMLCanvasElement, quality = MCP_JPEG_QUALITY): string {
  return encodeForMcp(canvas, quality);
}

/** Longest a capture waits for the browser to paint, ms. */
const PAINT_WAIT_MAX_MS = 250;

/**
 * Wait for two animation frames so React has flushed all canvas draws.
 *
 * Browsers do not run animation frames in a background tab — and the viewer's
 * tab is in the background whenever the user is working in Claude Desktop — so
 * the wait gives up after `maxWaitMs`. Timers still run there, and a hidden tab
 * has nothing to paint anyway (the 3-D capture renders its own frame).
 */
export function waitForPaint(maxWaitMs = PAINT_WAIT_MAX_MS): Promise<void> {
  return new Promise((resolve) => {
    const giveUp = setTimeout(resolve, maxWaitMs);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        clearTimeout(giveUp);
        resolve();
      }),
    );
  });
}

/** Render a grayscale SliceImage, downscale to MCP limits, and encode as JPEG. */
export function renderSliceForMcp(image: GrayImage): string {
  return encodeForMcp(imageToCanvas(image));
}

/**
 * A crop of a slice image, resampled to `outW`×`outH` and encoded as JPEG. The
 * crop is taken from the full-resolution slice, so a small field of view shows
 * real voxels, not a magnified thumbnail.
 */
export function cropSliceForMcp(
  image: GrayImage,
  rect: { x0: number; y0: number; x1: number; y1: number },
  outW: number,
  outH: number,
): string {
  const { canvas, ctx } = createCanvas(outW, outH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    imageToCanvas(image),
    rect.x0,
    rect.y0,
    rect.x1 - rect.x0,
    rect.y1 - rect.y0,
    0,
    0,
    outW,
    outH,
  );
  return jpegBase64(canvas);
}

export interface MontageTile {
  image: GrayImage;
  /** Caption drawn in the tile's corner, e.g. "axial 120/300". */
  label: string;
}

const MONTAGE_GAP_PX = 2;
const MONTAGE_LABEL_PAD_PX = 3;

/** Slices laid out on one sheet, each captioned — many views for the price of one image. */
export function montageForMcp(
  tiles: MontageTile[],
  columns: number,
  tileW: number,
  tileH: number,
): string {
  const rows = Math.ceil(tiles.length / columns);
  const { canvas, ctx } = createCanvas(
    columns * tileW + (columns - 1) * MONTAGE_GAP_PX,
    rows * tileH + (rows - 1) * MONTAGE_GAP_PX,
  );
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const fontPx = Math.max(11, Math.round(tileW / 22));
  ctx.font = `${fontPx}px sans-serif`;
  ctx.textBaseline = 'top';
  tiles.forEach((tile, i) => {
    const x = (i % columns) * (tileW + MONTAGE_GAP_PX);
    const y = Math.floor(i / columns) * (tileH + MONTAGE_GAP_PX);
    ctx.drawImage(imageToCanvas(tile.image), x, y, tileW, tileH);
    const labelW = ctx.measureText(tile.label).width + MONTAGE_LABEL_PAD_PX * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, labelW, Math.max(14, fontPx) + MONTAGE_LABEL_PAD_PX * 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(tile.label, x + MONTAGE_LABEL_PAD_PX, y + MONTAGE_LABEL_PAD_PX);
  });
  return jpegBase64(canvas);
}
