import { defaultFeatures, resolveFeatures } from '@/viewer/features';
import { defaultLabels, resolveLabels } from '@/viewer/labels';
import { defaultTheme, resolveTheme, themeCssVars, withAlpha } from '@/viewer/theme';
import { describe, expect, it } from 'vitest';
import tokensCss from './tokens.css?raw';

describe('resolveTheme', () => {
  it('fills what the host leaves out from the default theme', () => {
    const theme = resolveTheme({ colors: { amber: '#00ff88' }, severity: { critical: 'red' } });
    expect(theme.colors.amber).toBe('#00ff88');
    expect(theme.colors.violet).toBe(defaultTheme.colors.violet);
    expect(theme.severity).toEqual({ ...defaultTheme.severity, critical: 'red' });
    expect(theme.canvasBackground).toBe(defaultTheme.canvasBackground);
  });

  it('writes the tokens under the names the stylesheets read', () => {
    const vars = themeCssVars(defaultTheme);
    expect(vars['--pmri-panel-2']).toBe('#1c1a14');
    expect(vars['--pmri-ink-3']).toBe('#8a8068');
    expect(vars['--pmri-amber-dim']).toBe('#b67e2c');
    expect(vars['--pmri-surface-deep']).toBe('#050403');
    expect(vars['--pmri-mono']).toBe(defaultTheme.fonts.mono);
    expect(vars['--pmri-measure-glow']).toBe('color-mix(in srgb, #ff4500 45%, transparent)');
  });

  it('declares the same defaults in tokens.css as in defaultTheme', () => {
    for (const [name, value] of Object.entries(themeCssVars(defaultTheme))) {
      expect(tokensCss, name).toContain(`${name}: ${value};`);
    }
  });

  it('fades any CSS colour, not only #rrggbb', () => {
    expect(withAlpha('var(--amber)', 0.08)).toBe(
      'color-mix(in srgb, var(--amber) 8%, transparent)',
    );
    expect(withAlpha('rgb(1 2 3)', 0.267)).toBe(
      'color-mix(in srgb, rgb(1 2 3) 26.7%, transparent)',
    );
  });
});

describe('resolveFeatures', () => {
  it('keeps everything on unless turned off', () => {
    expect(resolveFeatures()).toEqual(defaultFeatures);
    expect(resolveFeatures({ measure: false }).measure).toBe(false);
    expect(resolveFeatures({ measure: false }).slab).toBe(true);
  });

  it('refuses an empty preset list', () => {
    expect(() => resolveFeatures({ renderPresets: [] })).toThrow('at least one preset');
  });
});

describe('resolveLabels', () => {
  it('replaces single strings and keeps the rest', () => {
    const labels = resolveLabels({
      planes: { axial: { name: 'Аксіальна' } },
      stage: { noVolume: 'Немає тому' },
    });
    expect(labels.planes.axial).toEqual({ ...defaultLabels.planes.axial, name: 'Аксіальна' });
    expect(labels.planes.coronal).toEqual(defaultLabels.planes.coronal);
    expect(labels.stage.noVolume).toBe('Немає тому');
    expect(labels.stage.unavailableTitle).toBe(defaultLabels.stage.unavailableTitle);
  });
});
