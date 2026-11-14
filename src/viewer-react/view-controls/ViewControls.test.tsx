/**
 * @vitest-environment happy-dom
 */
import { type ViewControlsTarget, memoryConfigStorage } from '@prisma-mri/viewer-core';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ViewControls } from './ViewControls';
import { ViewControlsProvider, type ViewControlsProviderProps } from './context';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const target = () =>
  ({
    rotate: vi.fn(),
    alignToPlane: vi.fn(),
    zoomBy: vi.fn(),
    fitToView: vi.fn(),
    resetView: vi.fn(),
    getViewState: () => ({ pitch: 12, yaw: -25, roll: 0, zoom: 1.25 }),
  }) satisfies ViewControlsTarget;

let mounted: { el: HTMLElement; root: Root } | null = null;

function mount(
  props: Partial<ViewControlsProviderProps>,
  formFactor: 'desktop' | 'tablet' | 'phone',
) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() =>
    root.render(
      <ViewControlsProvider target={target()} keyboardScope={null} {...props}>
        <ViewControls formFactor={formFactor} />
      </ViewControlsProvider>,
    ),
  );
  mounted = { el, root };
  return el;
}

afterEach(() => {
  if (!mounted) return;
  const { el, root } = mounted;
  act(() => root.unmount());
  el.remove();
  mounted = null;
});

const click = (el: Element | null) => act(() => (el as HTMLElement).click());

describe('<ViewControls/>', () => {
  it('desktop: dock with keycaps and tooltips, collapses to the launcher and back', () => {
    const el = mount({ storage: memoryConfigStorage(), config: { motion: 'none' } }, 'desktop');
    const toolbar = el.querySelector('[role="toolbar"]');
    expect(toolbar).not.toBeNull();
    expect(el.querySelectorAll('.pmv-vc-kbd').length).toBeGreaterThan(10);
    expect(el.querySelector('[aria-label="Yaw right"]')?.getAttribute('aria-keyshortcuts')).toBe(
      'ArrowRight',
    );
    click(el.querySelector('[aria-label="Hide view controls"]'));
    expect(el.querySelector('[role="toolbar"]')).toBeNull();
    const launcher = el.querySelector('.pmv-vc-launcher--desktop');
    expect(launcher?.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.pmv-vc-toast')?.textContent).toContain('shortcuts still work');
    click(launcher);
    expect(el.querySelector('[role="toolbar"]')).not.toBeNull();
  });

  it('tablet: no keycaps, a step chip that cycles 1 / 5 / 15 / 90°, no settings button', () => {
    const el = mount({}, 'tablet');
    expect(el.querySelector('.pmv-vc-kbd')).toBeNull();
    expect(el.querySelector('[aria-label="Shortcut settings"]')).toBeNull();
    const chip = () => el.querySelector('.pmv-vc-step');
    expect(chip()?.textContent).toContain('5°');
    click(chip());
    expect(chip()?.textContent).toContain('15°');
    click(chip());
    click(chip());
    expect(chip()?.textContent).toContain('1°');
    expect(el.querySelector('output.pmv-vc-readout')?.textContent).toBe(
      'P 12° · Y −25° · R 0° · 125%',
    );
  });

  it('tablet: keycaps appear once a real key press is seen (auto)', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() =>
      root.render(
        <ViewControlsProvider target={target()} keyboardScope={el}>
          <ViewControls formFactor="tablet" />
        </ViewControlsProvider>,
      ),
    );
    mounted = { el, root };
    expect(el.querySelector('.pmv-vc-kbd')).toBeNull();
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', key: 'x', bubbles: true }));
    });
    expect(el.querySelector('.pmv-vc-kbd')).not.toBeNull();
  });

  it('phone: rows sheet without keycaps; tabs layout when configured', () => {
    const el = mount({ config: { panel: { phoneLayout: 'tabs' } } }, 'phone');
    expect(el.querySelector('.pmv-vc-sheet[data-layout="tabs"]')).not.toBeNull();
    expect(el.querySelector('.pmv-vc-kbd')).toBeNull();
    const tabs = el.querySelectorAll('[role="tab"]');
    expect([...tabs].map((t) => t.textContent)).toEqual(['Rotate', 'Slice', 'Zoom']);
    expect(el.querySelectorAll('.pmv-vc-btn--tile')).toHaveLength(6);
    click(tabs[1]);
    expect(el.querySelectorAll('.pmv-vc-btn--tile')).toHaveLength(3);
  });

  it('phone: the grabber closes the sheet to the round launcher', () => {
    const el = mount({ config: { motion: 'none' } }, 'phone');
    expect(el.querySelector('.pmv-vc-sheet[data-layout="rows"]')).not.toBeNull();
    click(el.querySelector('.pmv-vc-grabber'));
    expect(el.querySelector('.pmv-vc-sheet')).toBeNull();
    expect(el.querySelector('.pmv-vc-launcher--phone')).not.toBeNull();
  });

  it("phone: phoneTrigger 'host' leaves opening to the host", () => {
    const el = mount({ config: { panel: { open: false, phoneTrigger: 'host' } } }, 'phone');
    expect(el.querySelector('.pmv-vc-launcher')).toBeNull();
  });

  it('animates a toggle, never the first mount', () => {
    const animate = vi.fn(() => ({ finished: new Promise(() => {}), cancel() {}, reverse() {} }));
    const original = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate as unknown as typeof original;
    try {
      const el = mount({ config: { motion: 'full' } }, 'phone');
      expect(animate).not.toHaveBeenCalled();
      click(el.querySelector('.pmv-vc-grabber'));
      expect(animate).toHaveBeenCalled();
      // The sheet stays while it slides away.
      expect(el.querySelector('.pmv-vc-sheet')).not.toBeNull();
    } finally {
      HTMLElement.prototype.animate = original;
    }
  });

  it('master switch off renders no controls', () => {
    const el = mount({ config: { enabled: false } }, 'desktop');
    expect(el.querySelector('[role="toolbar"]')).toBeNull();
    expect(el.querySelector('.pmv-vc-launcher')).toBeNull();
  });

  it('panel off renders no controls, but keys still work', () => {
    const t = target();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() =>
      root.render(
        <ViewControlsProvider target={t} keyboardScope={el} config={{ panel: { enabled: false } }}>
          <ViewControls formFactor="desktop" />
        </ViewControlsProvider>,
      ),
    );
    mounted = { el, root };
    expect(el.querySelector('[role="toolbar"]')).toBeNull();
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'c', bubbles: true }));
    });
    expect(t.alignToPlane).toHaveBeenCalledWith('coronal');
  });

  it('a switched-off action loses its button, and an empty group disappears', () => {
    const el = mount(
      {
        config: {
          actions: { alignCoronal: false, alignSagittal: false, alignAxial: false, zoomIn: false },
        },
      },
      'desktop',
    );
    expect(el.querySelector('[aria-label="Zoom in"]')).toBeNull();
    expect(el.querySelector('[aria-label="Zoom out"]')).not.toBeNull();
    expect(el.querySelector('[data-group="align"]')).toBeNull();
  });

  it('a button press drives the target; target null renders but does nothing', () => {
    const t = target();
    const el = mount({ target: t }, 'desktop');
    const btn = el.querySelector('[aria-label="Align · Axial"]') as HTMLButtonElement;
    act(() => {
      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
    });
    expect(t.alignToPlane).toHaveBeenCalledWith('axial');
    act(() =>
      mounted?.root.render(
        <ViewControlsProvider target={null} keyboardScope={null}>
          <ViewControls formFactor="desktop" />
        </ViewControlsProvider>,
      ),
    );
    expect(el.querySelector('[aria-label="Align · Axial"]')).not.toBeNull();
  });
});
