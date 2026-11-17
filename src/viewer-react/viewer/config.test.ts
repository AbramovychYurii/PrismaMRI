import { describe, expect, it } from 'vitest';
import { defaultFeatures, resolveFeatures } from './features';
import { defaultLabels, fillLabel, resolveLabels } from './labels';
import { defaultTheme, resolveTheme, themeCssVars, withAlpha } from './theme';
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
    expect(labels.export).toEqual({ filePrefix: 'viewer', shareTitle: 'Viewer' });
    expect(resolveLabels({ export: { filePrefix: 'scan' } }).export).toEqual({
      filePrefix: 'scan',
      shareTitle: 'Viewer',
    });
  });
});

describe('resolveLabels — the groups of the controls', () => {
  it('replaces one string and keeps its neighbours', () => {
    const labels = resolveLabels({
      toolbar: { focusOn: 'Вийти з фокусу' },
      findings: { dismiss: 'Видалити' },
    });
    expect(labels.toolbar.focusOn).toBe('Вийти з фокусу');
    expect(labels.toolbar.focusOff).toBe(defaultLabels.toolbar.focusOff);
    expect(labels.findings.dismiss).toBe('Видалити');
    expect(labels.findings.keep).toBe(defaultLabels.findings.keep);
  });

  it('merges render presets one by one, down to a single field', () => {
    const { presets } = resolveLabels({ dock: { presets: { bone: { name: 'Кістка' } } } }).dock;
    expect(presets.bone).toEqual({ ...defaultLabels.dock.presets.bone, name: 'Кістка' });
    expect(presets.mip).toEqual(defaultLabels.dock.presets.mip);
  });

  it('merges the mobile tabs, and the tab bar separately', () => {
    const { mobile } = resolveLabels({ mobile: { tabs: { controls: 'КЕР' } } });
    expect(mobile.tabs.controls).toBe('КЕР');
    expect(mobile.tabs.axial).toBe(defaultLabels.mobile.tabs.axial);
    expect(mobile.tabBar).toBe(defaultLabels.mobile.tabBar);
  });

  it('replaces the navigation tips as a whole', () => {
    const tips = [[{ key: 'Тягни', text: 'щоб гортати' }]];
    expect(resolveLabels({ dock: { tips } }).dock.tips).toBe(tips);
  });

  it('does not change the defaults it was given', () => {
    const before = JSON.stringify(defaultLabels);
    resolveLabels({ dock: { presets: { mip: { name: 'x' } } }, mobile: { tabs: { axial: 'y' } } });
    expect(JSON.stringify(defaultLabels)).toBe(before);
  });
});

describe('fillLabel', () => {
  it('fills every mark, whatever the order', () => {
    expect(fillLabel('{plane} · slice {number}', { number: 7, plane: 'Axial' })).toBe(
      'Axial · slice 7',
    );
    expect(fillLabel('{mm} mm, {mm}', { mm: 5 })).toBe('5 mm, 5');
  });

  it('leaves a mark with no value, so a typo in a label shows', () => {
    expect(fillLabel('Show {count} findings', { cnt: 3 })).toBe('Show {count} findings');
  });

  it('keeps text without marks as it is', () => {
    expect(fillLabel('Close', { count: 1 })).toBe('Close');
  });

  it('fills the marks every default label that has one names', () => {
    const MARKS: Record<string, string[]> = {
      'stageMenu.recording': ['percent'],
      'stageMenu.exportSpin': ['ext'],
      'stageMenu.shareSpin': ['ext'],
      'stageMenu.exportFailed': ['what'],
      'series.slices': ['count'],
      'findings.show': ['count'],
      'findings.removeMessage': ['label'],
      'findings.location': ['plane', 'number'],
      'findings.marker': ['severity', 'label'],
      'dock.slabMm': ['mm'],
      'rail.scrubber': ['plane'],
      'rail.panelKeys': ['plane'],
    };
    for (const [path, names] of Object.entries(MARKS)) {
      const text = path
        .split('.')
        .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], defaultLabels);
      expect(typeof text, path).toBe('string');
      const values = Object.fromEntries(names.map((n) => [n, 'x']));
      expect(fillLabel(text as string, values), path).not.toMatch(/\{\w+\}/);
    }
  });
});
