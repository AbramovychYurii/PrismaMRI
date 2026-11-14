/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest';
import { createViewControlsController } from './controller';
import { memoryConfigStorage } from './storage';
import type { ViewControlsTarget } from './target';

const fakeTarget = () => {
  const t = {
    rotate: vi.fn(),
    alignToPlane: vi.fn(),
    zoomBy: vi.fn(),
    fitToView: vi.fn(),
    resetView: vi.fn(),
  } satisfies ViewControlsTarget;
  return t;
};

describe('controller', () => {
  it('rotates by the configured step, Shift multiplies', () => {
    const target = fakeTarget();
    const c = createViewControlsController({ target });
    c.trigger('yawRight');
    c.trigger('pitchDown', { shift: true });
    expect(target.rotate).toHaveBeenNthCalledWith(1, 'yaw', 5);
    expect(target.rotate).toHaveBeenNthCalledWith(2, 'pitch', -15);
  });

  it('zooms by a factor', () => {
    const target = fakeTarget();
    const c = createViewControlsController({ target });
    c.trigger('zoomIn');
    c.trigger('zoomOut');
    expect(target.zoomBy.mock.calls[0][0]).toBeCloseTo(1.1);
    expect(target.zoomBy.mock.calls[1][0]).toBeCloseTo(1 / 1.1);
  });

  it('respects master and per-action switches', () => {
    const target = fakeTarget();
    const c = createViewControlsController({ target, config: { actions: { alignAxial: false } } });
    c.trigger('alignAxial');
    expect(target.alignToPlane).not.toHaveBeenCalled();
    c.updateConfig((cfg) => ({ ...cfg, enabled: false }));
    c.trigger('fitToView');
    expect(target.fitToView).not.toHaveBeenCalled();
  });

  it('persists config changes', () => {
    const storage = memoryConfigStorage();
    const c = createViewControlsController({ storage });
    c.setPanelOpen(false);
    expect((storage.load() as { panel: { open: boolean } }).panel.open).toBe(false);
    const again = createViewControlsController({ storage });
    expect(again.getState().config.panel.open).toBe(false);
  });

  it('handles keyboard on a scope and ignores typing in inputs', () => {
    const target = fakeTarget();
    const c = createViewControlsController({ target });
    const el = document.createElement('div');
    const input = document.createElement('input');
    el.appendChild(input);
    document.body.appendChild(el);
    const detach = c.attachKeyboard(el);
    el.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'c', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', key: 's', bubbles: true }));
    expect(target.alignToPlane).toHaveBeenCalledTimes(1);
    expect(target.alignToPlane).toHaveBeenCalledWith('coronal');
    detach();
  });
});

describe('controller keyboard rules', () => {
  const key = (code: string, key: string, init: KeyboardEventInit = {}) =>
    new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true, ...init });

  it('leaves arrows to controls that use them, but takes them elsewhere', () => {
    const target = fakeTarget();
    const c = createViewControlsController({ target });
    const el = document.createElement('div');
    const range = document.createElement('input');
    range.type = 'range';
    const tabs = document.createElement('div');
    tabs.setAttribute('role', 'tablist');
    const tab = document.createElement('button');
    tabs.appendChild(tab);
    el.append(range, tabs);
    document.body.appendChild(el);
    const detach = c.attachKeyboard(el);
    range.dispatchEvent(key('ArrowRight', 'ArrowRight'));
    tab.dispatchEvent(key('ArrowRight', 'ArrowRight'));
    expect(target.rotate).not.toHaveBeenCalled();
    const e = key('ArrowRight', 'ArrowRight');
    el.dispatchEvent(e);
    expect(target.rotate).toHaveBeenCalledWith('yaw', 5);
    expect(e.defaultPrevented).toBe(true);
    detach();
    c.pressEnd();
  });

  it('ignores composition, handled events, native repeats, and the host veto', () => {
    const target = fakeTarget();
    const c = createViewControlsController({ target });
    const el = document.createElement('div');
    document.body.appendChild(el);
    let allow = false;
    const detach = c.attachKeyboard(el, { shouldHandle: () => allow });
    el.dispatchEvent(key('KeyC', 'c'));
    expect(target.alignToPlane).not.toHaveBeenCalled();
    allow = true;
    el.dispatchEvent(key('KeyC', 'c', { isComposing: true }));
    const handled = key('KeyC', 'c');
    handled.preventDefault();
    el.dispatchEvent(handled);
    const repeat = key('KeyC', 'c', { repeat: true });
    el.dispatchEvent(repeat);
    expect(target.alignToPlane).not.toHaveBeenCalled();
    expect(repeat.defaultPrevented).toBe(true);
    detach();
  });

  it('while the settings dialog is open only its own key works; recording silences all', () => {
    const target = fakeTarget();
    const c = createViewControlsController({ target });
    const el = document.createElement('div');
    document.body.appendChild(el);
    const detach = c.attachKeyboard(el);
    el.dispatchEvent(key('Slash', '?', { shiftKey: true }));
    expect(c.getState().shortcutsOpen).toBe(true);
    el.dispatchEvent(key('KeyC', 'c'));
    expect(target.alignToPlane).not.toHaveBeenCalled();
    c.setRecording(true);
    el.dispatchEvent(key('Slash', '?', { shiftKey: true }));
    expect(c.getState().shortcutsOpen).toBe(true);
    c.setRecording(false);
    el.dispatchEvent(key('Slash', '?', { shiftKey: true }));
    expect(c.getState().shortcutsOpen).toBe(false);
    detach();
  });

  it('with two viewers on the page, keys go to the focused one', () => {
    const a = fakeTarget();
    const b = fakeTarget();
    const ca = createViewControlsController({ target: a });
    const cb = createViewControlsController({ target: b });
    const va = document.createElement('div');
    const vb = document.createElement('div');
    const input = document.createElement('button');
    vb.appendChild(input);
    document.body.append(va, vb);
    const da = ca.attachKeyboard(document, { element: va });
    const db = cb.attachKeyboard(document, { element: vb });
    input.focus();
    document.body.dispatchEvent(key('KeyA', 'a'));
    expect(a.alignToPlane).not.toHaveBeenCalled();
    expect(b.alignToPlane).toHaveBeenCalledWith('axial');
    da();
    db();
  });

  it('actionForKey reports what a key would do, honouring the switches', () => {
    const c = createViewControlsController({ config: { actions: { pitchUp: false } } });
    expect(c.actionForKey(key('ArrowDown', 'ArrowDown'))).toBe('pitchDown');
    expect(c.actionForKey(key('ArrowUp', 'ArrowUp'))).toBeNull();
    c.updateConfig((cfg) => ({ ...cfg, keyboard: { ...cfg.keyboard, enabled: false } }));
    expect(c.actionForKey(key('ArrowDown', 'ArrowDown'))).toBeNull();
  });
});

describe('controller state', () => {
  it('a silent replace (controlled config) neither echoes nor stores', () => {
    const onConfigChange = vi.fn();
    const storage = memoryConfigStorage();
    const c = createViewControlsController({ storage, onConfigChange });
    c.replaceConfig({ panel: { open: false } }, { silent: true });
    expect(c.getState().config.panel.open).toBe(false);
    expect(onConfigChange).not.toHaveBeenCalled();
    expect(storage.load()).toBeUndefined();
    c.togglePanel();
    expect(onConfigChange).toHaveBeenCalledTimes(1);
  });

  it('a new target bumps targetSeq and keeps the config', () => {
    const c = createViewControlsController({ config: { step: { rotateDeg: 15 } } });
    const before = c.getState().targetSeq;
    c.setTarget(fakeTarget());
    expect(c.getState().targetSeq).toBe(before + 1);
    expect(c.getState().config.step.rotateDeg).toBe(15);
  });

  it('press and hold: once at once, then continuously after the delay, frame-rate independent', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    try {
      const target = fakeTarget();
      const c = createViewControlsController({ target });
      c.pressStart('yawRight');
      expect(target.rotate).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(290);
      const before = target.rotate.mock.calls.length;
      const sumAfterDelay = () =>
        target.rotate.mock.calls.slice(1).reduce((s, call) => s + (call[1] as number), 0);
      expect(sumAfterDelay()).toBe(0);
      expect(before).toBe(1);
      vi.advanceTimersByTime(510); // 300 ms delay + 500 ms of hold = 10 steps of 5°
      expect(sumAfterDelay()).toBeGreaterThan(45);
      expect(sumAfterDelay()).toBeLessThan(55);
      expect(c.getState().heldAction).toBe('yawRight');
      c.pressEnd('yawRight');
      const calls = target.rotate.mock.calls.length;
      vi.advanceTimersByTime(200);
      expect(target.rotate.mock.calls.length).toBe(calls);
      expect(c.getState().heldAction).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('only repeatable actions repeat', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    try {
      const target = fakeTarget();
      const c = createViewControlsController({ target });
      c.pressStart('alignAxial');
      vi.advanceTimersByTime(800);
      expect(target.alignToPlane).toHaveBeenCalledTimes(1);
      expect(c.getState().heldAction).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
