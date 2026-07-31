import { clamp } from '@/lib/volume/math';

/**
 * Where the slice image sits inside its panel, as 0..1 fractions of the panel.
 * The image keeps its physical aspect ratio, so one axis is inset by bars.
 */
export interface LetterboxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function letterboxRect(aspect: number, panelWidth: number, panelHeight: number) {
  if (aspect >= panelWidth / panelHeight) {
    const drawnHeight = panelWidth / aspect;
    return {
      x: 0,
      y: (panelHeight - drawnHeight) / 2 / panelHeight,
      width: 1,
      height: drawnHeight / panelHeight,
    };
  }
  const drawnWidth = panelHeight * aspect;
  return {
    x: (panelWidth - drawnWidth) / 2 / panelWidth,
    y: 0,
    width: drawnWidth / panelWidth,
    height: 1,
  };
}

export function imageToPanel(fx: number, fy: number, rect: LetterboxRect) {
  return { fx: rect.x + fx * rect.width, fy: rect.y + fy * rect.height };
}

export function panelToImage(fx: number, fy: number, rect: LetterboxRect) {
  return {
    fx: clamp((fx - rect.x) / rect.width, 0, 1),
    fy: clamp((fy - rect.y) / rect.height, 0, 1),
  };
}

/** Pointer position → 0..1 fractions of the slice image drawn on `canvas`. */
export function pointerToImageFrac(
  event: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  rect: LetterboxRect | null,
) {
  const bounds = canvas.getBoundingClientRect();
  const fx = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
  const fy = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
  return rect ? panelToImage(fx, fy, rect) : { fx, fy };
}
