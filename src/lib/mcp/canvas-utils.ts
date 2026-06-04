/**
 * Canvas + image-encoding helpers used by the MCP bridge.
 *
 * Pure — no React, no Zustand. Safe to call from anywhere that has access
 * to a canvas element or raw RGBA pixels.
 */

import { MCP_JPEG_QUALITY, MCP_MAX_EDGE } from './constants';

/**
 * Downscale a canvas so its longest edge is at most MCP_MAX_EDGE, then encode
 * as JPEG. Keeps every image well under 1 MB after base64 encoding.
 */
export function encodeForMcp(src: HTMLCanvasElement, quality = MCP_JPEG_QUALITY): string {
  const scale = Math.min(1, MCP_MAX_EDGE / Math.max(src.width, src.height));
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));
  const out = document.createElement('canvas');
  out.width = dw;
  out.height = dh;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('encodeForMcp: failed to acquire 2D context');
  ctx.drawImage(src, 0, 0, dw, dh);
  return out.toDataURL('image/jpeg', quality).replace(/^data:[^;]+;base64,/, '');
}

/** Captures a canvas (with MCP-friendly downscale + JPEG encoding). */
export function captureCanvas(canvas: HTMLCanvasElement, quality = MCP_JPEG_QUALITY): string {
  return encodeForMcp(canvas, quality);
}

/** Wait for two animation frames so React has flushed all canvas draws. */
export function waitForPaint(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

/** Render a grayscale SliceImage, downscale to MCP limits, and encode as JPEG. */
export function renderSliceForMcp(image: {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('renderSliceForMcp: failed to acquire 2D context');
  ctx.putImageData(
    new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
    0,
    0,
  );
  return encodeForMcp(canvas);
}
