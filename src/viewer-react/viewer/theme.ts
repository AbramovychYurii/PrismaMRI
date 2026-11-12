import type { AnnotationSeverity } from '@prisma-mri/viewer-core';

/**
 * Colour tokens. Each becomes the CSS custom property of the same name in
 * kebab case, prefixed (`panel2` → `--pmri-panel-2`), on the viewer's root,
 * so every style that reads `var(--pmri-…)` follows the theme.
 */
export interface ViewerColors {
  bg: string;
  panel: string;
  panel2: string;
  rule: string;
  rule2: string;
  ink: string;
  ink2: string;
  ink3: string;
  ink4: string;
  /** Coronal accent, and the viewer's primary accent. */
  amber: string;
  amberDim: string;
  teal: string;
  tealDim: string;
  /** Sagittal accent. */
  violet: string;
  /** Axial accent. */
  azure: string;
  rose: string;
  surfaceDeep: string;
  /** Measurement points, line and label — in the panels and in 3-D. */
  measure: string;
}

export interface ViewerFonts {
  serif: string;
  sans: string;
  mono: string;
}

export interface ViewerTheme {
  colors: ViewerColors;
  fonts: ViewerFonts;
  /** Finding marker colour per severity — panels, 3-D view and findings card. */
  severity: Record<AnnotationSeverity, string>;
  /** Fill behind each slice image. */
  canvasBackground: string;
}

/** What a host passes: any part of the theme; the rest stays default. */
export interface ViewerThemeInput {
  colors?: Partial<ViewerColors>;
  fonts?: Partial<ViewerFonts>;
  severity?: Partial<Record<AnnotationSeverity, string>>;
  canvasBackground?: string;
}

/** PrismaMRI's own look — warm dark surfaces, amber / violet / azure planes. */
export const defaultTheme: ViewerTheme = {
  colors: {
    bg: '#0c0b09',
    panel: '#15130e',
    panel2: '#1c1a14',
    rule: '#2a261d',
    rule2: '#3a3527',
    ink: '#ece6d8',
    ink2: '#b6ad99',
    ink3: '#8a8068',
    ink4: '#534b3a',
    amber: '#ffb547',
    amberDim: '#b67e2c',
    teal: '#7fd1c5',
    tealDim: '#4d8a83',
    violet: '#b59dd1',
    azure: '#82a8d4',
    rose: '#d97a6b',
    surfaceDeep: '#050403',
    measure: '#ff4500',
  },
  fonts: {
    serif: '"IBM Plex Serif", Georgia, serif',
    sans: '"IBM Plex Sans", system-ui, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  },
  severity: {
    critical: '#ff3b30',
    serious: '#ff9500',
    moderate: '#ffd60a',
    comment: '#34c759',
  },
  canvasBackground: '#080604',
};

export function resolveTheme(input: ViewerThemeInput = {}): ViewerTheme {
  return {
    colors: { ...defaultTheme.colors, ...input.colors },
    fonts: { ...defaultTheme.fonts, ...input.fonts },
    severity: { ...defaultTheme.severity, ...input.severity },
    canvasBackground: input.canvasBackground ?? defaultTheme.canvasBackground,
  };
}

/**
 * `color` at `alpha` opacity, for any CSS colour a theme may hold — hex, rgb(),
 * a named colour or a `var(--…)` — where appending hex digits would only work
 * for #rrggbb.
 */
export function withAlpha(color: string, alpha: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 1000) / 10}%, transparent)`;
}

/** A theme accent at `alpha` opacity — follows the theme, unlike a baked rgba(). */
export function accentAlpha(accent: 'amber' | 'violet' | 'azure' | 'teal', alpha: number): string {
  return withAlpha(`var(--pmri-${accent})`, alpha);
}

const kebab = (key: string) => key.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);

/** The theme as CSS custom properties, for the viewer's root and its portals. */
export function themeCssVars(theme: ViewerTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.colors)) vars[`--pmri-${kebab(key)}`] = value;
  for (const [key, value] of Object.entries(theme.fonts)) vars[`--pmri-${key}`] = value;
  vars['--pmri-measure-glow'] = withAlpha(theme.colors.measure, 0.45);
  return vars;
}
