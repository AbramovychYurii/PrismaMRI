import { CANVAS_BG } from '@/constants';
import type { LetterboxRect } from '@/lib/volume/letterbox';
import type { SliceImage } from '@/types';
import { useEffect, useRef, useState } from 'react';

/** CSS size of a slice canvas, tracked with a ResizeObserver. */
export function useCanvasSize(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const [size, setSize] = useState({ w: 1, h: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(1, width), h: Math.max(1, height) });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef]);

  return size;
}

/**
 * Paints `image` into the canvas, letterboxed to `rect`. The offscreen buffer
 * is only resized when the slice dimensions change, so scrubbing repaints
 * without reallocating.
 */
export function useCanvasPainter(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  image: SliceImage | null,
  rect: LetterboxRect | null,
  size: { w: number; h: number },
) {
  const offscreen = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(size.w * dpr));
    const height = Math.max(1, Math.floor(size.h * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, width, height);
    if (!image) return;

    if (!offscreen.current) offscreen.current = document.createElement('canvas');
    const buffer = offscreen.current;
    if (buffer.width !== image.width) buffer.width = image.width;
    if (buffer.height !== image.height) buffer.height = image.height;

    const bufferCtx = buffer.getContext('2d');
    if (!bufferCtx) return;
    bufferCtx.putImageData(
      new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
      0,
      0,
    );

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (rect) {
      ctx.drawImage(
        buffer,
        rect.x * width,
        rect.y * height,
        rect.width * width,
        rect.height * height,
      );
    } else {
      ctx.drawImage(buffer, 0, 0, width, height);
    }
  }, [canvasRef, image, rect, size]);
}
