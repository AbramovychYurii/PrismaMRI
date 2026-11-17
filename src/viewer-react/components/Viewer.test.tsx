// @vitest-environment happy-dom
/**
 * `<Viewer>` as a host meets it: rendered into a page, given a volume, labels,
 * features and slots. There is no WebGL here, so the stage shows its "3D view
 * unavailable" message — which is also what a host sees on such a device; the
 * slice panels, the dock and the findings card are all real.
 */
import type { ImportSource, LoadResult } from '@prisma-mri/viewer-core';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ViewerInstance,
  ViewerProvider,
  type VolumeLoadRunner,
  createViewer,
  defaultLabels,
} from '../viewer';
import { Viewer, type ViewerProps } from './Viewer';
import { StatusStrip } from './status/StatusStrip';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SOURCE: ImportSource = {
  rootName: 'test',
  files: [{ path: 'a.nrrd', name: 'a.nrrd', file: new File([new Uint8Array(4)], 'a.nrrd') }],
};

const RESULT: LoadResult = {
  volume: {
    voxels: new Float32Array(8),
    meta: { dims: [2, 2, 2], spacing: [1, 1, 1], origin: [0, 0, 0], bitsAllocated: 16 },
    scalarMin: 0,
    scalarMax: 1,
    windowLevel: { window: 1, level: 0.5 },
    formatId: 'nrrd',
  },
  prepared3D: {
    data: new Uint8Array(8),
    dims: [2, 2, 2],
    spacing: [1, 1, 1],
    clim: [0, 255],
    threshold: 0.5,
    sourceRange: [0, 1],
    sourceDims: [2, 2, 2],
  },
  histogram: { bins: new Uint32Array(4), min: 0, max: 1, count: 8 },
};
const loaded: VolumeLoadRunner = async () => ({ kind: 'volume', result: RESULT });

/** Anything the page logs that is not the missing WebGL, which this environment lacks by design. */
let unexpectedLogs: string[] = [];

beforeEach(() => {
  unexpectedLogs = [];
  const keep = (...args: unknown[]) => {
    const text = args.map(String).join(' ');
    if (!/WebGL/.test(text)) unexpectedLogs.push(text);
  };
  vi.spyOn(console, 'error').mockImplementation(keep);
  vi.spyOn(console, 'warn').mockImplementation(keep);
});

afterEach(() => {
  cleanup();
  expect(unexpectedLogs, 'the page logged errors or warnings').toEqual([]);
});

async function newViewer(): Promise<ViewerInstance> {
  const viewer = createViewer({ runLoad: loaded });
  await act(async () => {
    await viewer.load(SOURCE);
  });
  return viewer;
}

/** Renders a loaded viewer; `props` are what the host passes to `<Viewer>`. */
async function mount(props: Partial<ViewerProps> = {}, viewer?: ViewerInstance) {
  const ready = viewer ?? (await newViewer());
  const view = render(<Viewer viewer={ready} layout="desktop" {...props} />);
  return {
    viewer: ready,
    ...view,
    root: view.container.querySelector('.pmri-root') as HTMLElement,
  };
}

function addFinding(viewer: ViewerInstance, label = 'Finding A') {
  act(() => {
    viewer.addAnnotation({
      id: `finding-${label}`,
      plane: 'axial',
      fx: 0.5,
      fy: 0.5,
      voxel: { x: 1, y: 1, z: 1 },
      label,
      summary: 'Sample',
      severity: 'serious',
      confidence: 80,
    });
  });
}

describe('the default viewer', () => {
  it('shows the stage, three slice panels and the dock', async () => {
    const { root, getByTestId, queryByText } = await mount();
    expect(root).toHaveProperty('dataset.layout', 'desktop');
    for (const plane of ['coronal', 'sagittal', 'axial']) {
      getByTestId(`slice-panel-${plane}`);
    }
    expect(queryByText(defaultLabels.stage.unavailableTitle)).not.toBeNull();
    expect(queryByText(defaultLabels.sections.render)).not.toBeNull();
  });

  it('has nothing to scrub before a volume arrives', () => {
    const viewer = createViewer();
    const { queryByTestId } = render(<Viewer viewer={viewer} layout="desktop" />);
    expect(viewer.getSnapshot().status).toBe('empty');
    expect(queryByTestId('scrubber-axial')).toBeNull();
  });
});

describe('labels', () => {
  it('replaces one string, and fills its marks', async () => {
    const { getByRole } = await mount({
      labels: { planes: { axial: { name: 'Аксіальна' } }, rail: { scrubber: 'Зріз: {plane}' } },
    });
    getByRole('slider', { name: 'Зріз: Аксіальна' });
    getByRole('slider', { name: 'Зріз: Coronal' });
  });

  it('fills the count in the findings pill', async () => {
    const viewer = await newViewer();
    addFinding(viewer);
    const { getByRole } = await mount(
      { labels: { findings: { show: 'Знахідок: {count}' } } },
      viewer,
    );
    getByRole('button', { name: 'Знахідок: 1' });
  });

  it('puts the mobile tab names where the host wants them', async () => {
    const { getByRole } = await mount({
      layout: 'mobile',
      labels: { mobile: { tabs: { controls: 'КЕР' } }, controlsTab: 'Керування' },
    });
    expect(getByRole('tab', { name: 'Керування' }).textContent).toContain('КЕР');
  });

  it('reaches a StatusStrip the host places outside <Viewer>', async () => {
    const viewer = await newViewer();
    const { getByText } = render(
      <ViewerProvider
        viewer={viewer}
        labels={{ ...defaultLabels, status: { ...defaultLabels.status, scanner: 'Сканер' } }}
      >
        <StatusStrip />
      </ViewerProvider>,
    );
    getByText('Сканер');
  });

  /** Every string of the labels, replaced by a marker naming where it is. */
  function marked<T>(value: T, path = ''): T {
    if (typeof value === 'string') return `⟦${path}⟧` as T;
    if (Array.isArray(value)) return value.map((v, i) => marked(v, `${path}[${i}]`)) as T;
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, marked(v, path ? `${path}.${k}` : k)]),
      ) as T;
    }
    return value;
  }

  /** The text and the spoken attributes of the whole page, portals included. */
  function wordsOnPage(): string[] {
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim();
      if (text) found.push(text);
    }
    for (const el of document.body.querySelectorAll('*')) {
      for (const name of ['aria-label', 'title', 'aria-valuetext', 'aria-description']) {
        const value = el.getAttribute(name);
        if (value) found.push(value);
      }
    }
    return found;
  }

  it('is the only source of words: with every label marked, no other word is on the page', async () => {
    const viewer = await newViewer();
    addFinding(viewer);
    const { getByRole, getByTestId } = await mount(
      { labels: marked(defaultLabels), onExit: () => {} },
      viewer,
    );

    const seen = new Set<string>();
    const suspects = new Set<string>();
    const look = () => {
      for (const text of wordsOnPage()) {
        for (const m of text.matchAll(/⟦([^⟧]*)⟧/g)) seen.add(m[1]);
        const rest = text.replace(/⟦[^⟧]*⟧/g, '').trim();
        if (/\p{L}{3,}/u.test(rest)) suspects.add(rest);
      }
    };

    look();
    fireEvent.click(getByRole('button', { name: '⟦findings.show⟧' }));
    look();
    fireEvent.click(getByRole('button', { name: '⟦findings.dismissAria⟧' }));
    look(); // the confirm dialog, in its portal
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.click(
      within(getByTestId('slice-panel-axial')).getByRole('button', { name: '⟦rail.expand⟧' }),
    );
    look();

    // What is left is the host's own data: a finding's label and summary.
    expect([...suspects].sort()).toEqual(['Finding A', 'Sample']);
    // And the page really did use the labels: a good share of them showed up.
    expect(seen.size).toBeGreaterThan(60);
    for (const path of ['dock.window', 'findings.removeTitle', 'rail.collapse', 'session.exit']) {
      expect(seen, path).toContain(path);
    }
  });
});

describe('features', () => {
  it('keeps the rail and the dock unless the host turns them off', async () => {
    const { queryByTestId, queryByText } = await mount();
    expect(queryByTestId('slice-panel-axial')).not.toBeNull();
    expect(queryByText(defaultLabels.sections.display)).not.toBeNull();
  });

  it('leaves out the dock', async () => {
    const { queryByText, queryByRole } = await mount({ features: { dock: false } });
    expect(queryByText(defaultLabels.sections.render)).toBeNull();
    expect(queryByRole('button', { name: defaultLabels.dock.hide })).toBeNull();
  });

  it('leaves out the slice panels', async () => {
    const { queryByTestId } = await mount({ features: { rail: false } });
    expect(queryByTestId('slice-panel-axial')).toBeNull();
  });

  it('leaves out the slab control, and offers only the presets it is given', async () => {
    const { queryByText, queryByRole } = await mount({
      features: { slab: false, renderPresets: ['bone'] },
    });
    expect(queryByText(defaultLabels.dock.slabTitle)).toBeNull();
    expect(queryByRole('button', { name: /^Bone/ })).not.toBeNull();
    expect(queryByRole('button', { name: /^Tissue/ })).toBeNull();
    expect(queryByRole('button', { name: /^MIP/ })).toBeNull();
  });

  it('shows no findings pill when findings are off', async () => {
    const viewer = await newViewer();
    addFinding(viewer);
    const on = await mount({}, viewer);
    expect(on.queryByRole('button', { name: /AI findings/ })).not.toBeNull();
    cleanup();
    const off = await mount({ features: { annotations: false } }, viewer);
    expect(off.queryByRole('button', { name: /AI findings/ })).toBeNull();
  });

  it('refuses an empty list of render presets', () => {
    expect(() =>
      render(<Viewer viewer={createViewer()} features={{ renderPresets: [] }} />),
    ).toThrow(/renderPresets/);
    unexpectedLogs = []; // React logs the error it rethrows
  });
});

describe('slots and the way out', () => {
  const Overlay: ReactNode = <button type="button">Agent</button>;

  it('draws the host overlay over the stage', async () => {
    const { getByRole } = await mount({ slots: { stageOverlay: Overlay } });
    getByRole('button', { name: 'Agent' });
  });

  it("offers the host's actions inside the findings card, with the finding", async () => {
    const viewer = await newViewer();
    addFinding(viewer);
    const seen: string[] = [];
    const { getByRole } = await mount(
      {
        slots: {
          annotationActions: ({ finding, index, all }) => {
            seen.push(`${finding.label}:${index}/${all.length}`);
            return <button type="button">Report</button>;
          },
        },
      },
      viewer,
    );
    fireEvent.click(getByRole('button', { name: /AI findings/ }));
    getByRole('button', { name: 'Report' });
    expect(seen).toContain('Finding A:0/1');
  });

  it('shows the exit button only when the host gives a way out, and uses it', async () => {
    const without = await mount();
    expect(without.queryByRole('button', { name: defaultLabels.session.exit })).toBeNull();
    cleanup();

    const onExit = vi.fn();
    const withExit = await mount({ onExit });
    fireEvent.click(withExit.getByRole('button', { name: defaultLabels.session.exit }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe('several viewers on one page', () => {
  it('keep their own cursors', async () => {
    const [a, b] = [await newViewer(), await newViewer()];
    const view = render(
      <>
        <Viewer viewer={a} layout="desktop" />
        <Viewer viewer={b} layout="desktop" />
      </>,
    );
    const [rootA, rootB] = [...view.container.querySelectorAll<HTMLElement>('.pmri-root')];
    const cursorText = (root: HTMLElement) =>
      root.textContent
        ?.match(/x(\d+)y(\d+)z(\d+)/)
        ?.slice(1)
        .join(',');

    expect(cursorText(rootA)).toBe('1,1,1');
    act(() => a.setCursor({ x: 0, y: 1, z: 0 }));
    expect(cursorText(rootA)).toBe('0,1,0');
    expect(cursorText(rootB)).toBe('1,1,1');
    expect(b.getSnapshot().cursor).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('send a key to the viewer it was pressed in, and not to the other', async () => {
    const [a, b] = [await newViewer(), await newViewer()];
    const view = render(
      <>
        <Viewer viewer={a} layout="desktop" />
        <Viewer viewer={b} layout="desktop" />
      </>,
    );
    const panelA = within(
      view.container.querySelectorAll<HTMLElement>('.pmri-root')[0],
    ).getByTestId('slice-panel-axial');
    const before = b.getSnapshot().cursor;
    const beforeA = a.getSnapshot().cursor;
    // Shift + an arrow moves the crosshair; on a 2-voxel edge one of the two directions is blocked.
    for (const key of ['ArrowLeft', 'ArrowRight']) {
      fireEvent.keyDown(panelA, { key, shiftKey: true });
      if (JSON.stringify(a.getSnapshot().cursor) !== JSON.stringify(beforeA)) break;
    }
    expect(a.getSnapshot().cursor).not.toEqual(beforeA);
    expect(b.getSnapshot().cursor).toEqual(before);
  });
});

describe('unmounting', () => {
  it('removes every listener it put on window and document', async () => {
    const added = new Map<string, number>();
    const track = (target: EventTarget, label: string) => {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      vi.spyOn(target, 'addEventListener').mockImplementation(((type: string, ...rest: never[]) => {
        added.set(`${label}:${type}`, (added.get(`${label}:${type}`) ?? 0) + 1);
        return (add as (...a: unknown[]) => void)(type, ...rest);
      }) as typeof target.addEventListener);
      vi.spyOn(target, 'removeEventListener').mockImplementation(((
        type: string,
        ...rest: never[]
      ) => {
        added.set(`${label}:${type}`, (added.get(`${label}:${type}`) ?? 0) - 1);
        return (remove as (...a: unknown[]) => void)(type, ...rest);
      }) as typeof target.removeEventListener);
    };
    track(window, 'window');
    track(document, 'document');

    const { unmount } = await mount({ keyboardTarget: window });
    unmount();

    const leaks = [...added].filter(([, net]) => net !== 0);
    expect(leaks).toEqual([]);
  });

  it('leaves the viewer itself usable, and disposable', async () => {
    const { viewer, unmount } = await mount();
    unmount();
    expect(() => viewer.dispose()).not.toThrow();
    expect(() => viewer.dispose()).not.toThrow();
    act(() => viewer.setCursor({ x: 0, y: 0, z: 0 }));
    expect(viewer.getSnapshot().cursor).toEqual({ x: 0, y: 0, z: 0 });
  });
});
