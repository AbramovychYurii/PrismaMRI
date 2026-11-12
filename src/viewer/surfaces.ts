import type { ThreePreview } from '@/lib/volume/three-preview';
import type { SlicePlane } from '@/types';

/**
 * The live drawing surfaces of one viewer: each slice panel's canvas and the
 * 3-D preview. They are registered by the components that own them and read on
 * demand (captures, reports), so they live outside the reactive store — a
 * canvas mounting must not re-render every subscriber.
 */
export interface ViewerSurfaces {
  canvas: (plane: SlicePlane) => HTMLCanvasElement | null;
  setCanvas: (plane: SlicePlane, canvas: HTMLCanvasElement | null) => void;
  preview: () => ThreePreview | null;
  setPreview: (preview: ThreePreview | null) => void;
}

export function createViewerSurfaces(): ViewerSurfaces {
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
