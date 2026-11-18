import { type ViewerLabelsInput, resolveLabels } from './labels';

/** One control: the keys or gestures used together, and what they do. */
export interface ViewerShortcut {
  /** Keys or gestures used together, e.g. `['Shift', 'Drag']`. */
  keys: string[];
  /** Another way to do the same, shown after a "/" — e.g. the touch gesture. */
  altKeys?: string[];
  action: string;
}

export interface ViewerShortcutGroup {
  title: string;
  shortcuts: ViewerShortcut[];
}

/**
 * Every key and pointer gesture the viewer answers to, grouped — for a host's
 * help screen, so it lists what this version of the viewer does. Words come
 * from `labels` (the same input `<Viewer labels>` takes); key names are shown
 * as they are on the key.
 */
export function viewerShortcuts(labels?: ViewerLabelsInput): ViewerShortcutGroup[] {
  const t = resolveLabels(labels).shortcuts;
  return [
    {
      title: t.slices,
      shortcuts: [
        { keys: [t.scroll], action: t.navigateSlices },
        { keys: ['↑ / ↓'], action: t.stepSlice },
        { keys: ['PgUp / PgDn'], action: t.jumpSlices },
        { keys: ['Home / End'], action: t.firstLastSlice },
      ],
    },
    {
      title: t.panels,
      shortcuts: [
        { keys: [t.click], action: t.activatePlane },
        { keys: ['1 / 2 / 3'], action: t.focusPlane },
        { keys: ['Shift', t.drag], action: t.measure },
        { keys: [t.rightClick], altKeys: [t.longPress], action: t.measureMenu },
        { keys: ['Tab'], action: t.focusPanel },
        { keys: ['Shift', '← → ↑ ↓'], action: t.moveCrosshair },
        { keys: ['Shift', 'F10'], altKeys: ['Menu'], action: t.measureMenuKeys },
      ],
    },
    {
      title: t.series,
      shortcuts: [
        { keys: ['[ / ]'], action: t.switchSeries },
        { keys: ['Tab'], action: t.focusSeries },
        { keys: ['↑ / ↓'], action: t.chooseSeries },
      ],
    },
    {
      title: t.view3d,
      shortcuts: [
        { keys: [t.drag], action: t.orbit },
        { keys: [t.scroll], action: t.zoom },
      ],
    },
  ];
}
