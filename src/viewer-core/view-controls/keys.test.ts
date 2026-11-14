import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, DEFAULT_CONFIG, normalizeConfig } from './config';
import {
  actionUsingCombo,
  ariaKeyShortcut,
  comboFromEvent,
  findConflicts,
  formatCombo,
  matchesCombo,
  parseCombo,
} from './keys';

const ev = (
  code: string,
  key: string,
  mods: Partial<Record<'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey', boolean>> = {},
) => ({
  code,
  key,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe('keys', () => {
  it('parses and formats symbol combos', () => {
    expect(parseCombo('key:+')).toMatchObject({ key: '+', code: null });
    expect(parseCombo('Ctrl+key:+')).toMatchObject({ key: '+', ctrl: true });
    expect(formatCombo('Shift+ArrowRight')).toEqual(['⇧', '→']);
    expect(formatCombo('KeyQ')).toEqual(['Q']);
  });

  it('matches letters by physical key on non-Latin layouts', () => {
    expect(matchesCombo(ev('KeyQ', 'й'), 'KeyQ', 'rollCcw')).toBe(true);
  });

  it('lets Shift through only for steppable actions', () => {
    expect(
      matchesCombo(ev('ArrowRight', 'ArrowRight', { shiftKey: true }), 'ArrowRight', 'yawRight'),
    ).toBe(true);
    expect(matchesCombo(ev('KeyC', 'C', { shiftKey: true }), 'KeyC', 'alignCoronal')).toBe(false);
    expect(matchesCombo(ev('Slash', '?', { shiftKey: true }), 'key:?', 'openShortcuts')).toBe(true);
  });

  it('requires exact Ctrl/Alt/Meta', () => {
    expect(matchesCombo(ev('KeyR', 'r', { ctrlKey: true }), 'KeyR', 'resetView')).toBe(false);
  });

  it('records combos from events', () => {
    expect(comboFromEvent(ev('ShiftLeft', 'Shift', { shiftKey: true }))).toBeNull();
    expect(comboFromEvent(ev('KeyW', 'w', { altKey: true }))).toBe('Alt+KeyW');
    expect(comboFromEvent(ev('Equal', '+', { shiftKey: true }))).toBe('key:+');
  });

  it('spells combos for aria-keyshortcuts', () => {
    expect(ariaKeyShortcut('ArrowRight')).toBe('ArrowRight');
    expect(ariaKeyShortcut('Ctrl+Shift+KeyQ')).toBe('Control+Shift+Q');
    expect(ariaKeyShortcut('Digit0')).toBe('0');
    expect(ariaKeyShortcut('key:+')).toBe('+');
  });

  it('default bindings have no conflicts', () => {
    expect(findConflicts(DEFAULT_BINDINGS).size).toBe(0);
    expect(actionUsingCombo(DEFAULT_BINDINGS, 'KeyS', 'rollCw')).toBe('alignSagittal');
  });
});

describe('config', () => {
  it('survives garbage from storage', () => {
    expect(normalizeConfig('nope')).toEqual(DEFAULT_CONFIG);
    const c = normalizeConfig({
      step: { rotateDeg: 'x', zoomPercent: 500 },
      panel: { keycaps: 'sometimes' },
    });
    expect(c.step.rotateDeg).toBe(5);
    expect(c.step.zoomPercent).toBe(100);
    expect(c.panel.keycaps).toBe('auto');
  });
});
