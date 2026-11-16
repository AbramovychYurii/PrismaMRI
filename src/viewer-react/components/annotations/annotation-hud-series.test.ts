// @vitest-environment happy-dom
/**
 * The findings panel in a study with several series: it sits below the series
 * selector instead of on top of it, counts and steps through the findings of
 * every series, and tells which series the finding is on.
 */
import type { Annotation, SeriesChoice } from '@prisma-mri/viewer-core';
import { act, createElement } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewerProvider, type ViewerStoreState, createViewer, getViewerStore } from '../../viewer';
import { AnnotationHud } from './AnnotationHud';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const series = (key: string): SeriesChoice => ({
  key,
  label: `Series ${key}`,
  count: 1,
  rows: 2,
  columns: 2,
});

const finding = (id: string, severity: Annotation['severity'], seriesKey?: string): Annotation => ({
  id,
  volumeId: `vol-${seriesKey ?? 'x'}`,
  seriesKey,
  plane: 'axial',
  fx: 0.5,
  fy: 0.5,
  voxel: { x: 1, y: 2, z: 3 },
  label: `Finding ${id}`,
  severity,
});

let root: Root | null = null;

function mountHud(state: Partial<ViewerStoreState>, viewer = createViewer()) {
  getViewerStore(viewer).setState(state);
  const host = document.body.appendChild(document.createElement('div'));
  const children = createElement(AnnotationHud);
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
  return { viewer, host };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('findings panel next to the series selector', () => {
  it('stays where it is when the study has one series', () => {
    const { host } = mountHud({ annotations: [finding('a', 'moderate')] });
    expect(host.querySelector('[data-below-series]')).toBeNull();
  });

  it('moves below the series selector when there is one', () => {
    const { host } = mountHud({
      annotations: [finding('a', 'moderate', '1')],
      seriesList: [series('1'), series('2')],
      activeSeriesKey: '1',
    });
    expect(host.querySelector('[data-below-series]')).not.toBeNull();
  });

  it('counts the findings of every series, not just the one on screen', () => {
    const { host } = mountHud({
      annotations: [finding('a', 'moderate', '1')],
      otherSeriesAnnotations: [finding('b', 'serious', '2'), finding('c', 'comment', '3')],
      seriesList: [series('1'), series('2'), series('3')],
      activeSeriesKey: '1',
    });
    expect(
      host.querySelector('button[aria-label$="AI findings"]')?.getAttribute('aria-label'),
    ).toBe('Show 3 AI findings');
  });

  it('shows on a series with no findings of its own, when another has some', () => {
    const { host } = mountHud({
      annotations: [],
      otherSeriesAnnotations: [finding('b', 'serious', '2')],
      seriesList: [series('1'), series('2')],
      activeSeriesKey: '1',
    });
    expect(host.querySelector('button[aria-label$="AI findings"]')).not.toBeNull();
  });
});

describe('stepping through findings on several series', () => {
  it('goes to the next finding through the viewer, which switches series if it must', () => {
    // The panel takes the method when it renders, so the spy goes in first.
    const viewer = createViewer();
    const focus = vi.spyOn(viewer, 'focusAnnotation');
    const { host } = mountHud(
      {
        annotations: [finding('a', 'serious', '1')],
        otherSeriesAnnotations: [finding('b', 'moderate', '2')],
        seriesList: [series('1'), series('2')],
        activeSeriesKey: '1',
        activeAnnotationId: 'a',
      },
      viewer,
    );

    // The panel opens on the focused finding; step to the next one.
    act(() => {
      (
        host.querySelector('button[aria-label$="AI findings"]') as HTMLButtonElement | null
      )?.click();
    });
    act(() => {
      (host.querySelector('button[aria-label="Next finding"]') as HTMLButtonElement).click();
    });

    expect(focus).toHaveBeenCalledWith('b');
  });

  it('says which series the finding on screen is on', () => {
    const { host } = mountHud({
      annotations: [finding('a', 'serious', '1')],
      otherSeriesAnnotations: [finding('b', 'moderate', '2')],
      seriesList: [series('1'), series('2')],
      activeSeriesKey: '1',
      activeAnnotationId: 'a',
    });
    act(() => {
      (
        host.querySelector('button[aria-label$="AI findings"]') as HTMLButtonElement | null
      )?.click();
    });
    expect(host.querySelector('[title="Series"]')?.textContent).toContain('Series 1');
  });

  it('cannot dismiss a finding that is on a series not on screen', () => {
    const { host } = mountHud({
      annotations: [],
      otherSeriesAnnotations: [finding('b', 'moderate', '2')],
      seriesList: [series('1'), series('2')],
      activeSeriesKey: '1',
    });
    act(() => {
      (
        host.querySelector('button[aria-label$="AI findings"]') as HTMLButtonElement | null
      )?.click();
    });
    expect(
      (host.querySelector('button[aria-label="Dismiss finding"]') as HTMLButtonElement | null)
        ?.disabled,
    ).toBe(true);
  });

  it('cannot step on while another series is still loading', () => {
    const { host } = mountHud({
      annotations: [finding('a', 'serious', '1')],
      otherSeriesAnnotations: [finding('b', 'moderate', '2')],
      seriesList: [series('1'), series('2')],
      activeSeriesKey: '1',
      activeAnnotationId: 'a',
      switchingSeriesKey: '2',
    });
    act(() => {
      (
        host.querySelector('button[aria-label$="AI findings"]') as HTMLButtonElement | null
      )?.click();
    });
    const button = (label: string) =>
      host.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
    expect(button('Next finding').disabled).toBe(true);
    expect(button('Previous finding').disabled).toBe(true);
  });
});
