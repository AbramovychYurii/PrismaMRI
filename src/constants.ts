export const APP_NAME = 'PrismaMRI';

export const MAX_3D_TEXTURE_EDGE = 512;
export const WL_DEBOUNCE_MS = 96;

export const ONEVOLUME_MARKER = 'JmVolumeVersion=1';
export const ONEVOLUME_WINDOW_SCALE = 100;
export const CT_VOL_NAME = 'CT_0.vol';
export const DICOM_HEADER_SCAN_BYTES = 8192;
export const OUTSIDE_SCAN_SENTINEL = -32768;

/**
 * Single source of truth for the accent palette. CSS keeps its own copies in
 * globals.css (for `var(--x)`), this mirrors them for contexts that need a
 * concrete value: Three.js numeric hex and arbitrary-alpha rgba glows.
 */
export const ACCENT_HEX = {
  amber: '#ffb547',
  violet: '#b59dd1',
  azure: '#82a8d4',
  teal: '#7fd1c5',
} as const;

export type Accent = keyof typeof ACCENT_HEX;

export const ACCENT_HEX_NUM: Record<Accent, number> = {
  amber: 0xffb547,
  violet: 0xb59dd1,
  azure: 0x82a8d4,
  teal: 0x7fd1c5,
};

export const ACCENT_VAR: Record<Accent, string> = {
  amber: 'var(--amber)',
  violet: 'var(--violet)',
  azure: 'var(--azure)',
  teal: 'var(--teal)',
};

/** rgba() string for an accent at the given alpha (glows, tints). */
export function accentRgba(accent: Accent, alpha: number): string {
  const n = Number.parseInt(ACCENT_HEX[accent].slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export type Axis = 'x' | 'y' | 'z';

/** Axis → accent: X = amber, Y = violet, Z = azure. */
export const AXIS_ACCENT: Record<Axis, Accent> = {
  x: 'amber',
  y: 'violet',
  z: 'azure',
};

/** Slice plane → accent (matches the panel headers). */
export const PLANE_ACCENT_KEY: Record<'coronal' | 'sagittal' | 'axial', Accent> = {
  coronal: 'amber',
  sagittal: 'violet',
  axial: 'azure',
};

export const PLANE_ACCENT: Record<'coronal' | 'sagittal' | 'axial', string> = {
  coronal: ACCENT_VAR[PLANE_ACCENT_KEY.coronal],
  sagittal: ACCENT_VAR[PLANE_ACCENT_KEY.sagittal],
  axial: ACCENT_VAR[PLANE_ACCENT_KEY.axial],
};

export const PLANE_GLYPH: Record<'coronal' | 'sagittal' | 'axial', string> = {
  coronal: 'C',
  sagittal: 'S',
  axial: 'A',
};

export const PLANE_FOOTER: Record<
  'coronal' | 'sagittal' | 'axial',
  { hint: string; code: string }
> = {
  coronal: { hint: 'R ← → L', code: 'XZ' },
  sagittal: { hint: 'A ← → P', code: 'YZ' },
  axial: { hint: 'R ← → L', code: 'XY' },
};

export const PLANE_LABEL: Record<'coronal' | 'sagittal' | 'axial', string> = {
  coronal: 'Coronal · frontal',
  sagittal: 'Sagittal · lateral',
  axial: 'Axial · transverse',
};
