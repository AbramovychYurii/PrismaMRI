import type { AnnotationSeverity, Axis, SlicePlane } from '@/types';
import { defaultTheme } from '@/viewer/theme';

export const APP_NAME = 'PrismaMRI';

export const WL_DEBOUNCE_MS = 96;

/** The accents CSS reaches as `var(--pmri-amber)` etc.; their values live in the theme. */
export type Accent = 'amber' | 'violet' | 'azure' | 'teal';

export const ACCENT_VAR: Record<Accent, string> = {
  amber: 'var(--pmri-amber)',
  violet: 'var(--pmri-violet)',
  azure: 'var(--pmri-azure)',
  teal: 'var(--pmri-teal)',
};

export type { Axis };

/** Axis → accent: X = amber, Y = violet, Z = azure. */
export const AXIS_ACCENT: Record<Axis, Accent> = {
  x: 'amber',
  y: 'violet',
  z: 'azure',
};

const SLICE_PLANES: ReadonlyArray<SlicePlane> = ['coronal', 'sagittal', 'axial'];

/** Type guard — narrows an unknown string to SlicePlane. */
export function isSlicePlane(value: string): value is SlicePlane {
  return (SLICE_PLANES as ReadonlyArray<string>).includes(value);
}

/** Slice plane → accent name (matches the panel headers). */
export const PLANE_ACCENT_KEY: Record<SlicePlane, Accent> = {
  coronal: 'amber',
  sagittal: 'violet',
  axial: 'azure',
};

/** Slice plane → CSS accent variable. */
export const PLANE_ACCENT: Record<SlicePlane, string> = {
  coronal: ACCENT_VAR[PLANE_ACCENT_KEY.coronal],
  sagittal: ACCENT_VAR[PLANE_ACCENT_KEY.sagittal],
  axial: ACCENT_VAR[PLANE_ACCENT_KEY.axial],
};

/**
 * Which axis colours each crosshair line on a panel. Deliberately independent
 * of the slice geometry in `plane.ts` — this is the panel's visual key, not a
 * statement about how voxels are laid out.
 */
export const PLANE_CROSSHAIR_AXES: Record<SlicePlane, { v: Axis; h: Axis }> = {
  coronal: { v: 'y', h: 'z' },
  sagittal: { v: 'x', h: 'z' },
  axial: { v: 'y', h: 'x' },
};

/** Italic glyph rendered in slice panel headers. */
export const PLANE_GLYPH: Record<SlicePlane, string> = {
  coronal: 'C',
  sagittal: 'S',
  axial: 'A',
};

/** Voxel axes each panel shows, in its footer beside the orientation hint. */
export const PLANE_AXIS_CODE: Record<SlicePlane, string> = {
  coronal: 'XZ',
  sagittal: 'YZ',
  axial: 'XY',
};

/** The default severity colours — for the app's PDF report; the viewer reads its theme. */
export const SEVERITY_HEX: Record<AnnotationSeverity, string> = defaultTheme.severity;

/** Most-severe-first ordering used when sorting findings in the navigator. */
export const SEVERITY_RANK: Record<AnnotationSeverity, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  comment: 3,
};
