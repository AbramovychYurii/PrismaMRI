import type { ActionId, SlicePlane } from '@prisma-mri/viewer-core';

/** All user-visible strings. Pass a partial override to <ViewControlsProvider messages={…}>. */
export interface ViewControlsMessages {
  actions: Record<ActionId, string>;
  /** Tooltip second line, e.g. "around the S–I axis". */
  actionHints: Partial<Record<ActionId, string>>;
  /** Short names for the phone tiles ("Pitch ↑"). */
  tileLabels: Partial<Record<ActionId, string>>;
  planes: Record<SlicePlane, string>;
  groups: { rotate: string; align: string; zoom: string };
  /** The align group's label where space is short (tablet dock, phone sheet). */
  alignShort: string;
  /** Short group names for the phone tabs layout. */
  tabs: { rotate: string; align: string; zoom: string };
  panel: string;
  showPanel: string;
  hidePanel: string;
  customize: string;
  collapsedToast: string;
  toShow: string;
  holdHint: string;
  stepButton: (deg: number) => string;
  readout: (view: { pitch: string; yaw: string; roll: string; zoom: string }) => string;
  settings: {
    title: string;
    subtitle: string;
    general: string;
    master: string;
    keyboard: string;
    panel: string;
    keycaps: string;
    keycapsAuto: string;
    keycapsAlways: string;
    keycapsNever: string;
    phoneLayout: string;
    phoneRows: string;
    phoneTabs: string;
    rotateStep: string;
    zoom: string;
    zoomStep: string;
    shiftMultiplier: string;
    actionEnabled: string;
    recording: string;
    pressKeys: string;
    addAlternate: string;
    removeShortcut: string;
    noShortcut: string;
    conflict: (combo: string, action: string) => string;
    swap: string;
    replace: string;
    cancel: string;
    resetAll: string;
    savedLocally: string;
    save: string;
    close: string;
    viewGroup: string;
  };
}

export const DEFAULT_MESSAGES: ViewControlsMessages = {
  actions: {
    pitchUp: 'Pitch up',
    pitchDown: 'Pitch down',
    yawLeft: 'Yaw left',
    yawRight: 'Yaw right',
    rollCcw: 'Roll counter-clockwise',
    rollCw: 'Roll clockwise',
    alignCoronal: 'Align · Coronal',
    alignSagittal: 'Align · Sagittal',
    alignAxial: 'Align · Axial',
    zoomOut: 'Zoom out',
    fitToView: 'Fit to view',
    zoomIn: 'Zoom in',
    resetView: 'Reset view',
    togglePanel: 'Show / hide panel',
    openShortcuts: 'Shortcut settings',
  },
  actionHints: {
    pitchUp: 'around the R–L axis',
    pitchDown: 'around the R–L axis',
    yawLeft: 'around the S–I axis',
    yawRight: 'around the S–I axis',
    rollCcw: 'around the view axis',
    rollCw: 'around the view axis',
    alignCoronal: 'look from the front',
    alignSagittal: 'look from the side',
    alignAxial: 'look from below',
  },
  tileLabels: {
    pitchUp: 'Pitch ↑',
    pitchDown: 'Pitch ↓',
    yawLeft: 'Yaw ←',
    yawRight: 'Yaw →',
    rollCcw: 'Roll ↺',
    rollCw: 'Roll ↻',
    alignCoronal: 'Coronal',
    alignSagittal: 'Sagittal',
    alignAxial: 'Axial',
    zoomOut: 'Zoom out',
    fitToView: 'Fit',
    zoomIn: 'Zoom in',
  },
  planes: { coronal: 'Coronal', sagittal: 'Sagittal', axial: 'Axial' },
  groups: { rotate: 'Rotate', align: 'Align to slice', zoom: 'Zoom' },
  alignShort: 'Align',
  tabs: { rotate: 'Rotate', align: 'Slice', zoom: 'Zoom' },
  panel: 'View controls',
  showPanel: 'Show view controls',
  hidePanel: 'Hide view controls',
  customize: 'Shortcut settings',
  collapsedToast: 'Panel hidden · shortcuts still work ·',
  toShow: 'to show',
  holdHint: 'hold for continuous',
  stepButton: (deg) => `Rotation step ${deg}°, tap to change`,
  readout: ({ pitch, yaw, roll, zoom }) => `P ${pitch} · Y ${yaw} · R ${roll} · ${zoom}`,
  settings: {
    title: 'View controls',
    subtitle: 'Click a shortcut to change it. “+” adds an alternative.',
    general: 'Controls',
    master: 'View controls',
    keyboard: 'Keyboard shortcuts',
    panel: 'On-screen panel',
    keycaps: 'Key hints',
    keycapsAuto: 'Auto',
    keycapsAlways: 'Always',
    keycapsNever: 'Never',
    phoneLayout: 'Phone layout',
    phoneRows: 'Rows',
    phoneTabs: 'Tabs',
    rotateStep: 'Rotation step',
    zoom: 'Zoom',
    zoomStep: 'Step',
    shiftMultiplier: 'Shift multiplier',
    actionEnabled: 'Enabled',
    recording: 'recording…',
    pressKeys: 'Press keys…',
    addAlternate: 'Add alternative shortcut',
    removeShortcut: 'Remove shortcut',
    noShortcut: 'No shortcut',
    conflict: (combo, action) => `${combo} is already assigned to ${action}.`,
    swap: 'Swap',
    replace: 'Replace',
    cancel: 'Cancel',
    resetAll: 'Reset to defaults',
    savedLocally: 'Saved locally in this browser',
    save: 'Save',
    close: 'Close',
    viewGroup: 'View',
  },
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown
    ? T[K]
    : T[K] extends object
      ? Partial<T[K]>
      : T[K];
};

export function mergeMessages(override?: DeepPartial<ViewControlsMessages>): ViewControlsMessages {
  if (!override) return DEFAULT_MESSAGES;
  const d = DEFAULT_MESSAGES;
  return {
    ...d,
    ...override,
    actions: { ...d.actions, ...override.actions },
    actionHints: { ...d.actionHints, ...override.actionHints },
    tileLabels: { ...d.tileLabels, ...override.tileLabels },
    planes: { ...d.planes, ...override.planes },
    groups: { ...d.groups, ...override.groups },
    tabs: { ...d.tabs, ...override.tabs },
    settings: { ...d.settings, ...override.settings },
  } as ViewControlsMessages;
}
