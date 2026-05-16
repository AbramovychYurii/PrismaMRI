export const APP_NAME = 'PrismaMRI';

export const MAX_3D_TEXTURE_EDGE = 512;
export const WL_DEBOUNCE_MS = 96;

export const ONEVOLUME_MARKER = 'JmVolumeVersion=1';
export const ONEVOLUME_WINDOW_SCALE = 100;
export const CT_VOL_NAME = 'CT_0.vol';
export const DICOM_HEADER_SCAN_BYTES = 8192;
export const OUTSIDE_SCAN_SENTINEL = -32768;

export const PLANE_ACCENT: Record<'coronal' | 'sagittal' | 'axial', string> = {
  coronal: 'var(--amber)',
  sagittal: 'var(--violet)',
  axial: 'var(--azure)',
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
