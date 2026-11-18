import type { ThreePreview } from '@prisma-mri/viewer-core';
import { describe, expect, it } from 'vitest';
import { createViewer, getSurfaceRegistry } from './createViewer';

/** A preview that answers with the camera and size each shot was taken with. */
function fakePreview(): ThreePreview {
  return {
    captureJpeg: (maxEdge?: number, quality?: number) => `current@${maxEdge}/${quality}`,
    captureJpegFromPlane: (plane: string, maxEdge?: number, quality?: number) =>
      `${plane}@${maxEdge}/${quality}`,
  } as unknown as ThreePreview;
}

describe('viewer.surfaces', () => {
  it('captures nothing while the 3-D view is not on screen', () => {
    expect(createViewer().surfaces.capture3D()).toBeNull();
  });

  it('captures the 3-D view from the current camera or from a plane', () => {
    const viewer = createViewer();
    getSurfaceRegistry(viewer).setPreview(fakePreview());

    expect(viewer.surfaces.capture3D({ maxEdge: 256, quality: 0.8 })).toBe('current@256/0.8');
    expect(viewer.surfaces.capture3D({ plane: 'axial' })).toBe('axial@undefined/undefined');
  });

  it('reads the canvases the panels registered, and offers no way to replace them', () => {
    const viewer = createViewer();
    const canvas = {} as HTMLCanvasElement;
    getSurfaceRegistry(viewer).setCanvas('sagittal', canvas);

    expect(viewer.surfaces.canvas('sagittal')).toBe(canvas);
    expect(viewer.surfaces.canvas('axial')).toBeNull();
    expect(Object.keys(viewer.surfaces).sort()).toEqual(['canvas', 'capture3D']);
  });

  it('keeps each viewer to its own surfaces', () => {
    const a = createViewer();
    const b = createViewer();
    getSurfaceRegistry(a).setPreview(fakePreview());

    expect(a.surfaces.capture3D()).not.toBeNull();
    expect(b.surfaces.capture3D()).toBeNull();
  });
});
