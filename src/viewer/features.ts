import type { RenderPreset } from '@/types';

/** What the viewer offers. Everything is on unless a host turns it off. */
export interface ViewerFeatures {
  /** Shift-drag and the slice menu's "Measure from / to here". */
  measure: boolean;
  /** Slab MIP thickness in the render controls. */
  slab: boolean;
  /** Export and share the 3-D view as an image or a spin video. */
  export: boolean;
  /** Toolbar: show the slice planes in the 3-D view. */
  planes: boolean;
  /** Toolbar: clip the volume at the active slice. */
  clip: boolean;
  /** Toolbar: focus mode. */
  focus: boolean;
  /** The stage's series switcher, for sources holding several series. */
  seriesSelect: boolean;
  /** Findings: markers on the panels and in 3-D, and the findings card. */
  annotations: boolean;
  /** The slice panels beside the stage — the slice tabs on mobile. */
  rail: boolean;
  /** The controls dock — the Controls tab on mobile. */
  dock: boolean;
  /** Render presets offered, in this order. Must not be empty. */
  renderPresets: readonly RenderPreset[];
}

export const ALL_RENDER_PRESETS: readonly RenderPreset[] = ['mip', 'tissue', 'bone'];

export const defaultFeatures: ViewerFeatures = {
  measure: true,
  slab: true,
  export: true,
  planes: true,
  clip: true,
  focus: true,
  seriesSelect: true,
  annotations: true,
  rail: true,
  dock: true,
  renderPresets: ALL_RENDER_PRESETS,
};

export function resolveFeatures(input: Partial<ViewerFeatures> = {}): ViewerFeatures {
  const features = { ...defaultFeatures, ...input };
  if (features.renderPresets.length === 0) {
    throw new Error('ViewerFeatures.renderPresets must list at least one preset.');
  }
  return features;
}
