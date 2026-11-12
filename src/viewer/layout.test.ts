/**
 * @vitest-environment happy-dom
 */
import { type ViewerLayout, useContainerLayout } from '@/viewer';
import type { ViewerLayoutMode } from '@/viewer/layout';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Stands in for the browser's ResizeObserver, resized by hand. */
let resize: (width: number) => void = () => {};
class FakeResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe() {
    resize = (width) =>
      this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as never);
  }
  disconnect() {
    resize = () => {};
  }
  unobserve() {}
}

function elementOfWidth(width: number): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ width }) as DOMRect;
  return el;
}

/** Renders the hook for `element` and returns a reader for its latest value. */
async function renderLayout(element: HTMLElement | null, mode: ViewerLayoutMode) {
  let latest: ViewerLayout | null | undefined;
  function Probe() {
    latest = useContainerLayout(element, mode);
    return null;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(createElement(Probe)));
  return { read: () => latest, unmount: () => act(async () => root.unmount()) };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useContainerLayout', () => {
  it("follows the container's width, not the window's", async () => {
    const view = await renderLayout(elementOfWidth(500), 'auto');
    expect(view.read()).toBe('mobile');

    await act(async () => resize(1200));
    expect(view.read()).toBe('desktop');

    await act(async () => resize(767));
    expect(view.read()).toBe('mobile');
    await view.unmount();
  });

  it('is null until there is an element to measure', async () => {
    const view = await renderLayout(null, 'auto');
    expect(view.read()).toBeNull();
    await view.unmount();
  });

  it('keeps a pinned layout whatever the width', async () => {
    const view = await renderLayout(elementOfWidth(300), 'desktop');
    expect(view.read()).toBe('desktop');
    await act(async () => resize(300));
    expect(view.read()).toBe('desktop');
    await view.unmount();
  });
});
