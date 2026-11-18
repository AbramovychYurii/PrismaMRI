import type { SlicePlane, ThreePreview } from '@prisma-mri/viewer-core';

/** How `capture3D` takes its picture. */
export interface Capture3DOptions {
  /** Shoot from this plane's standard view instead of the camera the user left. */
  plane?: SlicePlane;
  /** Longest edge of the image, in pixels (default 512). */
  maxEdge?: number;
  /** JPEG quality from 0 to 1 (default 0.92). */
  quality?: number;
}

/**
 * What a host may read from one viewer's drawing surfaces: each slice panel's
 * canvas, and a picture of the 3-D view. Read only — the viewer's components
 * put them there.
 */
export interface ViewerSurfaces {
  /** The slice panel's canvas for `plane`, or null while it is not on screen. Read it; do not draw on it. */
  canvas: (plane: SlicePlane) => HTMLCanvasElement | null;
  /**
   * The 3-D view as a base64 JPEG (no data-URL prefix), or null while it is not
   * on screen. With `plane`, the camera moves there for the shot and back in the
   * same call, so the user's view stays.
   */
  capture3D: (options?: Capture3DOptions) => string | null;
}

/**
 * The viewer's side of the surfaces: its components register what they own.
 * Kept outside the reactive store, so a canvas mounting does not re-render
 * every subscriber.
 */
export interface ViewerSurfaceRegistry {
  canvas: (plane: SlicePlane) => HTMLCanvasElement | null;
  setCanvas: (plane: SlicePlane, canvas: HTMLCanvasElement | null) => void;
  preview: () => ThreePreview | null;
  setPreview: (preview: ThreePreview | null) => void;
}

export function createSurfaceRegistry(): ViewerSurfaceRegistry {
  const canvases: Record<SlicePlane, HTMLCanvasElement | null> = {
    coronal: null,
    sagittal: null,
    axial: null,
  };
  let preview: ThreePreview | null = null;
  return {
    canvas: (plane) => canvases[plane],
    setCanvas: (plane, canvas) => {
      canvases[plane] = canvas;
    },
    preview: () => preview,
    setPreview: (p) => {
      preview = p;
    },
  };
}

/** The read-only face of a registry, for hosts. */
export function publicSurfaces(registry: ViewerSurfaceRegistry): ViewerSurfaces {
  return {
    canvas: (plane) => registry.canvas(plane),
    capture3D({ plane, maxEdge, quality } = {}) {
      const preview = registry.preview();
      if (!preview) return null;
      return plane
        ? preview.captureJpegFromPlane(plane, maxEdge, quality)
        : preview.captureJpeg(maxEdge, quality);
    },
  };
}
