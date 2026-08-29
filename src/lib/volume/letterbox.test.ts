import {
  type LetterboxRect,
  imageToPanel,
  letterboxRect,
  panelToImage,
  pointerToImageFrac,
} from '@/lib/volume/letterbox';
import { describe, expect, it } from 'vitest';

/** Minimal stand-in for the canvas — only its screen rect is ever read. */
function canvasAt(left: number, top: number, width: number, height: number): HTMLCanvasElement {
  return {
    getBoundingClientRect: () => ({ left, top, width, height }),
  } as unknown as HTMLCanvasElement;
}

describe('letterboxRect', () => {
  it('pillarboxes an image narrower than its panel', () => {
    // 1:1 image in a 200×100 panel → full height, bars left and right.
    const rect = letterboxRect(1, 200, 100);
    expect(rect.height).toBe(1);
    expect(rect.y).toBe(0);
    expect(rect.width).toBeCloseTo(0.5);
    expect(rect.x).toBeCloseTo(0.25);
  });

  it('letterboxes an image wider than its panel', () => {
    // 2:1 image in a 100×100 panel → full width, bars top and bottom.
    const rect = letterboxRect(2, 100, 100);
    expect(rect.width).toBe(1);
    expect(rect.x).toBe(0);
    expect(rect.height).toBeCloseTo(0.5);
    expect(rect.y).toBeCloseTo(0.25);
  });

  it('fills the panel exactly when the aspects match', () => {
    const rect = letterboxRect(2, 200, 100);
    expect(rect).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('keeps the drawn area centred', () => {
    for (const [aspect, w, h] of [
      [0.5, 300, 100],
      [3, 100, 400],
      [1.7, 640, 480],
    ] as const) {
      const r = letterboxRect(aspect, w, h);
      expect(r.x * 2 + r.width).toBeCloseTo(1);
      expect(r.y * 2 + r.height).toBeCloseTo(1);
    }
  });

  it('never draws outside the panel', () => {
    for (const [aspect, w, h] of [
      [0.25, 500, 100],
      [4, 100, 500],
      [1, 100, 100],
    ] as const) {
      const r = letterboxRect(aspect, w, h);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(1 + 1e-9);
      expect(r.y + r.height).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('imageToPanel ↔ panelToImage', () => {
  const rects: LetterboxRect[] = [
    { x: 0, y: 0, width: 1, height: 1 },
    letterboxRect(1, 200, 100),
    letterboxRect(2, 100, 100),
    letterboxRect(0.6, 333, 777),
  ];

  it('round-trips every point back to itself', () => {
    for (const rect of rects) {
      for (const fx of [0, 0.1, 0.5, 0.9, 1]) {
        for (const fy of [0, 0.1, 0.5, 0.9, 1]) {
          const panel = imageToPanel(fx, fy, rect);
          const back = panelToImage(panel.fx, panel.fy, rect);
          expect(back.fx).toBeCloseTo(fx);
          expect(back.fy).toBeCloseTo(fy);
        }
      }
    }
  });

  it('maps the image corners onto the drawn area, not the whole panel', () => {
    const rect = letterboxRect(1, 200, 100); // bars left/right
    expect(imageToPanel(0, 0, rect).fx).toBeCloseTo(0.25);
    expect(imageToPanel(1, 0, rect).fx).toBeCloseTo(0.75);
  });

  it('clamps a click on the letterbox bar to the image edge', () => {
    const rect = letterboxRect(1, 200, 100);
    expect(panelToImage(0, 0.5, rect).fx).toBe(0);
    expect(panelToImage(1, 0.5, rect).fx).toBe(1);
  });
});

describe('pointerToImageFrac', () => {
  const canvas = canvasAt(100, 50, 200, 100);

  it('measures relative to the canvas, not the page', () => {
    expect(pointerToImageFrac({ clientX: 200, clientY: 100 }, canvas, null)).toEqual({
      fx: 0.5,
      fy: 0.5,
    });
  });

  it('clamps a pointer that left the canvas', () => {
    expect(pointerToImageFrac({ clientX: -500, clientY: -500 }, canvas, null)).toEqual({
      fx: 0,
      fy: 0,
    });
    expect(pointerToImageFrac({ clientX: 9999, clientY: 9999 }, canvas, null)).toEqual({
      fx: 1,
      fy: 1,
    });
  });

  it('accounts for the letterbox when one is given', () => {
    // Same 1:1-in-200×100 panel: the centre of the canvas is still the centre
    // of the image, but the left edge of the canvas is not.
    const rect = letterboxRect(1, 200, 100);
    expect(pointerToImageFrac({ clientX: 200, clientY: 100 }, canvas, rect).fx).toBeCloseTo(0.5);
    expect(pointerToImageFrac({ clientX: 150, clientY: 100 }, canvas, rect).fx).toBeCloseTo(0);
  });
});
