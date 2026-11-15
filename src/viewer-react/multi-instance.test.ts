// @vitest-environment happy-dom
/**
 * Two viewers on one page: ids stay unique, and one viewer's keys never reach
 * the other's overlays.
 */
import { type ComponentProps, type ReactNode, act, createElement } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnotationHud } from './components/annotations/AnnotationHud';
import { ConfirmModal } from './components/ui/ConfirmModal';
import { Tooltip } from './components/ui/Tooltip';
import { isTopLayer, pushLayer, removeLayer } from './hooks/layers';
import { useEscapeKey } from './hooks/useEscapeKey';
import { useFocusTrap } from './hooks/useFocusTrap';
import { type ViewerInstance, ViewerProvider, createViewer, getViewerStore } from './viewer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; host: HTMLElement }[] = [];

function mount(node: ReactNode, host: HTMLElement = document.body.appendChild(div())): HTMLElement {
  const root = createRoot(host);
  act(() => root.render(node));
  mounted.push({ root, host });
  return host;
}

function div(): HTMLDivElement {
  return document.createElement('div');
}

/** A viewer's root element and the provider a component inside it sees. */
function viewerShell(
  viewer: ViewerInstance,
  rootElement: HTMLElement,
  children: ReactNode,
  keyboardTarget: EventTarget | null = rootElement,
): ReactNode {
  return createElement(ViewerProvider, {
    viewer,
    rootElement,
    keyboardTarget,
    portalContainer: document.body,
    children,
  });
}

function pressEscape(from: EventTarget): void {
  act(() => {
    from.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
}

let rootA: HTMLElement;
let rootB: HTMLElement;

beforeEach(() => {
  rootA = document.body.appendChild(div());
  rootB = document.body.appendChild(div());
  rootA.className = 'pmri-root';
  rootB.className = 'pmri-root';
});

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  document.body.innerHTML = '';
});

describe('ids', () => {
  it('gives every confirm dialog its own title id, referenced by its own dialog', () => {
    const noop = () => {};
    mount(createElement(ConfirmModal, { title: 'First', onConfirm: noop, onCancel: noop }));
    mount(createElement(ConfirmModal, { title: 'Second', onConfirm: noop, onCancel: noop }));

    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    expect(dialogs).toHaveLength(2);
    const ids = dialogs.map((d) => d.getAttribute('aria-labelledby'));
    expect(new Set(ids).size).toBe(2);
    for (const dialog of dialogs) {
      const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '');
      expect(dialog.contains(title)).toBe(true);
    }
    expect(document.querySelector('#confirm-modal-title')).toBeNull();
  });

  it('gives every findings card its own gradient, and the icon points at it', () => {
    const viewers = [createViewer(), createViewer()];
    const hosts = viewers.map((viewer, i) => {
      getViewerStore(viewer).setState({ activeVolumeId: 'v' });
      viewer.addAnnotation({
        id: `f${i}`,
        plane: 'axial',
        fx: 0.5,
        fy: 0.5,
        voxel: { x: 0, y: 0, z: 0 },
        label: 'Finding',
        severity: 'moderate',
      });
      return mount(viewerShell(viewer, i === 0 ? rootA : rootB, createElement(AnnotationHud)));
    });

    const gradients = hosts.flatMap((h) => [...h.querySelectorAll('linearGradient')]);
    const ids = gradients.map((g) => g.id).filter((id) => id.startsWith('hud-sparkle'));
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(document.querySelector('#hud-sparkle-grad')).toBeNull();
    for (const host of hosts) {
      const own = host.querySelector('linearGradient[id^="hud-sparkle"]')?.id;
      expect(host.innerHTML).toContain(`url(#${own})`);
    }
  });
});

describe('Esc', () => {
  function Probe({ onEscape }: { onEscape: () => void }) {
    useEscapeKey(onEscape);
    return null;
  }

  it("an overlay answers its own viewer's Esc and not another viewer's", () => {
    const viewer = createViewer();
    const closeA = vi.fn();
    const closeB = vi.fn();
    mount(viewerShell(viewer, rootA, createElement(Probe, { onEscape: closeA })));
    mount(viewerShell(viewer, rootB, createElement(Probe, { onEscape: closeB })));

    pressEscape(rootA);
    expect(closeA).toHaveBeenCalledTimes(1);
    expect(closeB).not.toHaveBeenCalled();

    pressEscape(rootB);
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).toHaveBeenCalledTimes(1);
  });

  it('listens on the viewer itself when shortcuts are off', () => {
    const close = vi.fn();
    mount(viewerShell(createViewer(), rootA, createElement(Probe, { onEscape: close }), null));
    pressEscape(rootA);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('a tooltip hides for Esc inside its own viewer only', () => {
    const viewer = createViewer();
    const button = () => createElement('button', { type: 'button' }, 'Go');
    const tipA = createElement(
      Tooltip,
      { label: 'Tip A' } as ComponentProps<typeof Tooltip>,
      button(),
    );
    mount(viewerShell(viewer, rootA, tipA), rootA);
    mount(viewerShell(viewer, rootB, createElement('button', { type: 'button' }, 'Other')), rootB);

    const open = () =>
      act(() => {
        rootA
          .querySelector('button')
          ?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      });
    open();
    const shown = () => document.body.textContent?.includes('Tip A') ?? false;
    expect(shown()).toBe(true);

    pressEscape(rootB.querySelector('button') as Element);
    expect(shown()).toBe(true);
    pressEscape(rootA.querySelector('button') as Element);
    expect(shown()).toBe(false);
  });

  it('confirm dialogs: Esc closes the newest only', () => {
    const first = vi.fn();
    const second = vi.fn();
    mount(createElement(ConfirmModal, { title: 'One', onConfirm: vi.fn(), onCancel: first }));
    mount(createElement(ConfirmModal, { title: 'Two', onConfirm: vi.fn(), onCancel: second }));

    pressEscape(document.body);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});

describe('modal layers', () => {
  it('tracks the newest layer, and falls back when it goes', () => {
    const a = div();
    const b = div();
    pushLayer(a);
    pushLayer(b);
    expect(isTopLayer(b)).toBe(true);
    expect(isTopLayer(a)).toBe(false);
    removeLayer(b);
    expect(isTopLayer(a)).toBe(true);
    removeLayer(a);
    expect(isTopLayer(a)).toBe(false);
    expect(isTopLayer(null)).toBe(false);
  });

  it('only the top focus trap pulls focus back', () => {
    function Trap({ label }: { label: string }) {
      const ref = { current: null as HTMLElement | null };
      return createElement(
        'div',
        {
          ref: (el: HTMLElement | null) => {
            ref.current = el;
          },
          'data-trap': label,
        },
        createElement(Inner, { target: ref }),
        createElement('button', { type: 'button', id: `in-${label}` }, label),
      );
    }
    function Inner({ target }: { target: { current: HTMLElement | null } }) {
      useFocusTrap(target);
      return null;
    }
    mount(createElement(Trap, { label: 'a' }));
    mount(createElement(Trap, { label: 'b' }));

    const inA = document.getElementById('in-a') as HTMLElement;
    const inB = document.getElementById('in-b') as HTMLElement;
    // B opened last, so it holds focus; focus landing in A is pulled into B,
    // and the trap of A does not pull it back — no tug of war.
    act(() => inA.focus());
    expect(document.querySelector('[data-trap="b"]')?.contains(document.activeElement)).toBe(true);
    expect(inB).toBeTruthy();
  });
});
