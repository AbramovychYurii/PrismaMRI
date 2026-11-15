// @vitest-environment happy-dom
/** The stage tells the user a series is loading, since the page can freeze while it does. */
import type { SeriesChoice } from '@prisma-mri/viewer-core';
import { act, createElement } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ViewerProvider, type ViewerStoreState, createViewer, getViewerStore } from '../../viewer';
import { StageSeriesLoading } from './StageSeriesLoading';
import { StageSeriesSelect } from './StageSeriesSelect';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const series = (key: string, label: string): SeriesChoice => ({
  key,
  label,
  count: 1,
  rows: 2,
  columns: 2,
});
const SERIES = [series('1', 'SAG_T1'), series('2', 'COR_T2')];

let root: Root | null = null;

function mount(state: Partial<ViewerStoreState>) {
  const viewer = createViewer();
  const store = getViewerStore(viewer);
  store.setState(state);
  const host = document.body.appendChild(document.createElement('div'));
  const children = [
    createElement(StageSeriesLoading, { key: 'l' }),
    createElement(StageSeriesSelect, { key: 's' }),
  ];
  root = createRoot(host);
  act(() =>
    root?.render(
      createElement(ViewerProvider, {
        viewer,
        rootElement: host,
        keyboardTarget: host,
        portalContainer: document.body,
        children,
      }),
    ),
  );
  return { host, store };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('series loading on the stage', () => {
  it('shows nothing while no switch is under way', () => {
    const { host } = mount({ seriesList: SERIES, activeSeriesKey: '1' });
    expect(host.querySelector('output')).toBeNull();
  });

  it('says which series is loading, once a switch starts', () => {
    const { host, store } = mount({ seriesList: SERIES, activeSeriesKey: '1' });
    act(() => store.getState().setSwitchingSeries('2'));
    const veil = host.querySelector('output');
    expect(veil?.textContent).toContain('Loading series');
    expect(veil?.textContent).toContain('COR_T2');
    expect(veil?.getAttribute('aria-busy')).toBe('true');
  });

  it('goes away when the switch is over', () => {
    const { host, store } = mount({ seriesList: SERIES, activeSeriesKey: '1' });
    act(() => store.getState().setSwitchingSeries('2'));
    act(() => store.getState().setSwitchingSeries(null));
    expect(host.querySelector('output')).toBeNull();
  });

  it('keeps the series list usable while a switch is under way, so the keyboard focus stays', () => {
    const { host, store } = mount({ seriesList: SERIES, activeSeriesKey: '1' });
    const list = () => host.querySelector('select') as HTMLSelectElement;
    act(() => store.getState().setSwitchingSeries('2'));
    // `disabled` would drop the focus the user is navigating with.
    expect(list().disabled).toBe(false);
    expect(list().getAttribute('aria-busy')).toBe('true');
  });

  it('shows the series being switched to, not the one still on screen', () => {
    const { host, store } = mount({ seriesList: SERIES, activeSeriesKey: '1' });
    const list = () => host.querySelector('select') as HTMLSelectElement;
    expect(list().value).toBe('1');
    act(() => store.getState().setSwitchingSeries('2'));
    expect(list().value).toBe('2');
  });
});
