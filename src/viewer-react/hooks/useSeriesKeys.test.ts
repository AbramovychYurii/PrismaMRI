// @vitest-environment happy-dom
/** [ and ] step through the series of a study from anywhere in the viewer. */
import type { SeriesChoice } from '@prisma-mri/viewer-core';
import { act, createElement } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ViewerFeatures,
  ViewerProvider,
  type ViewerStoreState,
  createViewer,
  defaultFeatures,
  getViewerStore,
} from '../viewer';
import { useSeriesKeys } from './useSeriesKeys';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const series = (key: string): SeriesChoice => ({ key, label: key, count: 1, rows: 2, columns: 2 });
const SERIES = [series('a'), series('b'), series('c')];

let root: Root | null = null;

function Probe() {
  useSeriesKeys();
  return null;
}

function mount(state: Partial<ViewerStoreState>, features?: ViewerFeatures) {
  const viewer = createViewer();
  const switchSeries = vi.spyOn(viewer, 'switchSeries').mockResolvedValue();
  const store = getViewerStore(viewer);
  store.setState(state);
  const host = document.body.appendChild(document.createElement('div'));
  const children = createElement(Probe);
  root = createRoot(host);
  act(() =>
    root?.render(
      createElement(ViewerProvider, {
        viewer,
        rootElement: host,
        keyboardTarget: host,
        portalContainer: document.body,
        features,
        children,
      }),
    ),
  );
  return { host, store, switchSeries };
}

const press = (target: EventTarget, init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('series keys', () => {
  it('] opens the next series and [ the previous one', () => {
    const { host, switchSeries } = mount({ seriesList: SERIES, activeSeriesKey: 'b' });
    press(host, { code: 'BracketRight', key: ']' });
    expect(switchSeries).toHaveBeenLastCalledWith('c');
    press(host, { code: 'BracketLeft', key: '[' });
    expect(switchSeries).toHaveBeenLastCalledWith('a');
  });

  it('goes by the physical key, so a layout with other characters on the brackets works', () => {
    const { host, switchSeries } = mount({ seriesList: SERIES, activeSeriesKey: 'a' });
    press(host, { code: 'BracketRight', key: 'ї' });
    expect(switchSeries).toHaveBeenCalledWith('b');
  });

  it('also goes by the character, for input that sends no code', () => {
    const { host, switchSeries } = mount({ seriesList: SERIES, activeSeriesKey: 'b' });
    press(host, { code: '', key: ']' });
    expect(switchSeries).toHaveBeenLastCalledWith('c');
    press(host, { code: '', key: '[' });
    expect(switchSeries).toHaveBeenLastCalledWith('a');
  });

  it('counts from the series being switched to, so quick presses walk on', () => {
    const { host, switchSeries } = mount({
      seriesList: SERIES,
      activeSeriesKey: 'a',
      switchingSeriesKey: 'b',
    });
    press(host, { code: 'BracketRight', key: ']' });
    expect(switchSeries).toHaveBeenCalledWith('c');
  });

  it('stops at the ends of the list instead of wrapping', () => {
    const { host, switchSeries } = mount({ seriesList: SERIES, activeSeriesKey: 'c' });
    const event = press(host, { code: 'BracketRight', key: ']' });
    expect(switchSeries).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('does nothing for a single-series volume', () => {
    const { host, switchSeries } = mount({});
    press(host, { code: 'BracketRight', key: ']' });
    expect(switchSeries).not.toHaveBeenCalled();
  });

  it('leaves modified keys and text fields alone', () => {
    const { host, switchSeries } = mount({ seriesList: SERIES, activeSeriesKey: 'a' });
    press(host, { code: 'BracketRight', key: ']', metaKey: true });
    press(host, { code: 'BracketRight', key: ']', ctrlKey: true });
    const input = host.appendChild(document.createElement('input'));
    press(input, { code: 'BracketRight', key: ']' });
    expect(switchSeries).not.toHaveBeenCalled();
  });

  it('is off when the host has turned the series selector off', () => {
    const { host, switchSeries } = mount(
      { seriesList: SERIES, activeSeriesKey: 'a' },
      { ...defaultFeatures, seriesSelect: false },
    );
    press(host, { code: 'BracketRight', key: ']' });
    expect(switchSeries).not.toHaveBeenCalled();
  });
});
