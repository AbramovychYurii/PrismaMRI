import type { AnnotationSeverity, SlicePlane } from '@prisma-mri/viewer-core';

export interface PlaneLabel {
  /** "Coronal" — panel headers, tabs, the findings card. */
  name: string;
  /** "frontal" — beside the name in the panel header. */
  detail: string;
  /** Orientation in the panel footer, e.g. "R ← → L". */
  hint: string;
}

/** The viewer's words. English by default; a host passes any part to replace. */
export interface ViewerLabels {
  planes: Record<SlicePlane, PlaneLabel>;
  severity: Record<AnnotationSeverity, string>;
  /** The mobile tab for the 3-D stage. */
  view3d: string;
  /** The mobile tab holding the controls (the dock's content). */
  controlsTab: string;
  stage: {
    noVolume: string;
    unavailableTitle: string;
    unavailableHint: string;
    contextLostTitle: string;
    contextLostHint: string;
    /** Over the stage while another series of the study loads; the series' name follows it. */
    switchingSeries: string;
  };
  /** Titles of the control groups — dock cells, and the mobile Controls tab. */
  sections: {
    display: string;
    study: string;
    navigation: string;
    render: string;
    session: string;
  };
  session: {
    /** The exit button, shown when the host gives `onExit`. */
    exit: string;
    disclaimerLead: string;
    disclaimer: string;
  };
  /** Toolbar over the stage: each button's tip reads as its next action. */
  toolbar: {
    focusOff: string;
    focusOn: string;
    railOff: string;
    railOn: string;
    planesOff: string;
    planesActive: string;
    planesAll: string;
    clipOff: string;
    clipOn: string;
  };
  /** The stage's options menu (export and share). `{percent}` and `{ext}` are filled in. */
  stageMenu: {
    title: string;
    /** `{percent}` — while the turntable video records. */
    recording: string;
    exportView: string;
    /** `{ext}` — the video format the browser records. */
    exportSpin: string;
    shareView: string;
    shareSpin: string;
    /** What the files are called in the share sheet and in a failure message. */
    viewName: string;
    spinName: string;
    /** `{what}` — `viewName` or `spinName`. */
    exportFailed: string;
  };
  /** The selector over the stage for a study with several series. */
  series: {
    switchLabel: string;
    switchHint: string;
    /** `{count}` — slices in a series. */
    slices: string;
  };
  /** The error bar over the stage. */
  alert: { close: string };
  /** Confirm dialogs, unless the caller names its own buttons. */
  confirm: { confirm: string; cancel: string };
  /** The findings pill and card. `{count}`, `{label}`, `{plane}`, `{number}`, `{severity}` are filled in. */
  findings: {
    pill: string;
    /** `{count}` */
    show: string;
    summary: string;
    close: string;
    confidence: string;
    series: string;
    dismissAria: string;
    dismiss: string;
    previous: string;
    next: string;
    removeTitle: string;
    /** `{label}` */
    removeMessage: string;
    keep: string;
    /** `{plane}`, `{number}` — where a finding sits. */
    location: string;
    /** `{severity}`, `{label}` — a marker over the slice, spoken. */
    marker: string;
  };
  /** The dock's cells: display, navigation, render and study. */
  dock: {
    hide: string;
    show: string;
    window: string;
    level: string;
    windowHint: string;
    levelHint: string;
    cursor: string;
    /** Rows of the navigation tips; a row is `key` + `text` pairs, the key set in bold. */
    tips: { key: string; text: string }[][];
    slabOff: string;
    /** `{mm}` */
    slabMm: string;
    slabTitle: string;
    slabInfo: string;
    presets: Record<'mip' | 'tissue' | 'bone', { name: string; desc: string }>;
    studyId: string;
    acquired: string;
    protocol: string;
    voxels: string;
    range: string;
    source: string;
    sourceValue: string;
  };
  /** The status strip: one line of what is open. */
  status: {
    scanner: string;
    volume: string;
    spacing: string;
    modality: string;
    measure: string;
    setEndpoint: string;
  };
  /** The mobile tab bar: short visible names; the spoken ones are `planes[…].name`, `view3d` and `controlsTab`. */
  mobile: {
    tabBar: string;
    tabs: Record<'3d' | 'coronal' | 'sagittal' | 'axial' | 'controls', string>;
  };
  /** The slice panels: tray buttons, the measure menu, the scrubber. */
  rail: {
    collapse: string;
    expand: string;
    toggleScrubber: string;
    exportSlice: string;
    nextSlice: string;
    previousSlice: string;
    /** `{plane}` — the scrubber's name. */
    scrubber: string;
    /** `{plane}` — the panel's name for a screen reader, with its keys. */
    panelKeys: string;
    measureHint: string;
    sliceActions: string;
    measureFrom: string;
    measureTo: string;
    viewFromSide: string;
    clearMeasurement: string;
  };
  /** What the viewer calls the files it hands out (PNG slices, 3-D image and video). */
  export: {
    /** File names start with it: `viewer-axial-42.png`. */
    filePrefix: string;
    /** Title of the OS share sheet; the item follows it: "Viewer — 3D view". */
    shareTitle: string;
  };
}

/** What a host passes: any part of the labels, down to a single string. */
export interface ViewerLabelsInput {
  planes?: Partial<Record<SlicePlane, Partial<PlaneLabel>>>;
  severity?: Partial<Record<AnnotationSeverity, string>>;
  view3d?: string;
  controlsTab?: string;
  stage?: Partial<ViewerLabels['stage']>;
  sections?: Partial<ViewerLabels['sections']>;
  session?: Partial<ViewerLabels['session']>;
  toolbar?: Partial<ViewerLabels['toolbar']>;
  stageMenu?: Partial<ViewerLabels['stageMenu']>;
  series?: Partial<ViewerLabels['series']>;
  alert?: Partial<ViewerLabels['alert']>;
  confirm?: Partial<ViewerLabels['confirm']>;
  findings?: Partial<ViewerLabels['findings']>;
  dock?: Partial<Omit<ViewerLabels['dock'], 'presets'>> & {
    presets?: Partial<Record<'mip' | 'tissue' | 'bone', Partial<{ name: string; desc: string }>>>;
  };
  status?: Partial<ViewerLabels['status']>;
  mobile?: { tabBar?: string; tabs?: Partial<ViewerLabels['mobile']['tabs']> };
  rail?: Partial<ViewerLabels['rail']>;
  export?: Partial<ViewerLabels['export']>;
}

export const defaultLabels: ViewerLabels = {
  planes: {
    coronal: { name: 'Coronal', detail: 'frontal', hint: 'R ← → L' },
    sagittal: { name: 'Sagittal', detail: 'lateral', hint: 'A ← → P' },
    axial: { name: 'Axial', detail: 'transverse', hint: 'R ← → L' },
  },
  severity: {
    critical: 'Critical',
    serious: 'Serious',
    moderate: 'Moderate',
    comment: 'Note',
  },
  view3d: '3D view',
  controlsTab: 'Controls (CTRL)',
  stage: {
    noVolume: 'No volume loaded',
    unavailableTitle: '3D view unavailable',
    unavailableHint:
      "This browser or device can't run WebGL 2, which the 3D view needs. The slice panels still work.",
    contextLostTitle: '3D view interrupted',
    contextLostHint:
      'The graphics driver was reset. The view comes back by itself once it recovers.',
    switchingSeries: 'Loading series',
  },
  sections: {
    display: 'Display',
    study: 'Study',
    navigation: 'Navigation',
    render: 'Render Mode',
    session: 'Session',
  },
  session: {
    exit: 'Back to import',
    disclaimerLead: 'Reference only.',
    disclaimer: 'Not for diagnosis, treatment planning, measurements, or implant workflows.',
  },
  toolbar: {
    focusOff: 'Focus mode',
    focusOn: 'Exit focus mode',
    railOff: 'Show side panel',
    railOn: 'Hide side panel',
    planesOff: 'Show slice planes',
    planesActive: 'Show all 3 planes',
    planesAll: 'Hide slice planes',
    clipOff: 'Clip volume at active slice',
    clipOn: 'Disable clip mode',
  },
  stageMenu: {
    title: 'Stage options',
    recording: 'Recording 3D spin — {percent}%',
    exportView: 'Export 3D view (.png)',
    exportSpin: 'Export 3D spin (.{ext})',
    shareView: 'Share 3D view (.png)',
    shareSpin: 'Share 3D spin (.{ext})',
    viewName: '3D view',
    spinName: '3D spin',
    exportFailed: 'Failed to export the {what}. Try again, or reload the page if it keeps failing.',
  },
  series: {
    switchLabel: 'Switch series',
    switchHint: 'Switch series — [ and ] step through them',
    slices: '{count} sl',
  },
  alert: { close: 'Close' },
  confirm: { confirm: 'Confirm', cancel: 'Cancel' },
  findings: {
    pill: 'FINDINGS',
    show: 'Show {count} AI findings',
    summary: 'Finding summary',
    close: 'Close',
    confidence: 'Confidence:',
    series: 'Series',
    dismissAria: 'Dismiss finding',
    dismiss: 'Dismiss',
    previous: 'Previous finding',
    next: 'Next finding',
    removeTitle: 'Remove finding?',
    removeMessage: '"{label}" will be permanently removed from the viewer.',
    keep: 'Keep',
    location: '{plane} · slice {number}',
    marker: '{severity}: {label}',
  },
  dock: {
    hide: 'Hide control panels',
    show: 'Show control panels',
    window: 'Window',
    level: 'Level',
    windowHint: 'Contrast span — narrower window sharpens bone & raises 3D contrast.',
    levelHint: 'Brightness center — higher emphasizes dense tissue in 2D & 3D.',
    cursor: 'Cursor · voxel',
    tips: [
      [{ key: 'Drag', text: 'any plane to scrub linked slices.' }],
      [
        { key: 'Wheel', text: 'to step slices ·' },
        { key: 'Shift+drag', text: 'to measure (fullscreen).' },
      ],
      [{ key: '↑ ↓', text: 'step the active plane by 1 slice.' }],
      [{ key: '1 2 3', text: 'focus coronal · sagittal · axial.' }],
    ],
    slabOff: 'Off',
    slabMm: '{mm} mm',
    slabTitle: 'Slab MIP',
    slabInfo:
      'Maximum Intensity Projection — composites several adjacent slices into one image. Reveals vessels, fractures and lesions that span multiple slices. 3–5 mm is ideal for most CT studies.',
    presets: {
      mip: { name: 'MIP', desc: 'Max intensity — full range grayscale' },
      tissue: { name: 'Tissue', desc: 'Fat · muscle · fluid · marrow' },
      bone: { name: 'Bone', desc: 'Highlights dense bright structures' },
    },
    studyId: 'ID',
    acquired: 'Acquired',
    protocol: 'Protocol',
    voxels: 'Voxels',
    range: 'Range',
    source: 'Source',
    sourceValue: 'Local · in-memory',
  },
  status: {
    scanner: 'Scanner',
    volume: 'Volume',
    spacing: 'Spacing',
    modality: 'Modality',
    measure: 'Measure',
    setEndpoint: 'Set endpoint',
  },
  mobile: {
    tabBar: 'Views',
    tabs: { '3d': '3D', coronal: 'COR', sagittal: 'SAG', axial: 'AXI', controls: 'CTRL' },
  },
  rail: {
    collapse: 'Collapse panel',
    expand: 'Expand panel',
    toggleScrubber: 'Toggle slice scrubber',
    exportSlice: 'Export slice as PNG',
    nextSlice: 'Next slice',
    previousSlice: 'Previous slice',
    scrubber: '{plane} slice',
    panelKeys:
      '{plane} slice — up and down arrows step through slices, Shift and arrow keys move the crosshair, Shift+F10 opens the measure menu',
    measureHint: '· SHIFT+DRAG · MEASURE',
    sliceActions: 'Slice actions',
    measureFrom: 'Measure from here',
    measureTo: 'Measure to here',
    viewFromSide: 'View from this side',
    clearMeasurement: 'Clear measurement',
  },
  export: {
    filePrefix: 'viewer',
    shareTitle: 'Viewer',
  },
};

export function resolveLabels(input: ViewerLabelsInput = {}): ViewerLabels {
  const d = defaultLabels;
  const planes = input.planes ?? {};
  return {
    planes: {
      coronal: { ...d.planes.coronal, ...planes.coronal },
      sagittal: { ...d.planes.sagittal, ...planes.sagittal },
      axial: { ...d.planes.axial, ...planes.axial },
    },
    severity: { ...d.severity, ...input.severity },
    view3d: input.view3d ?? d.view3d,
    controlsTab: input.controlsTab ?? d.controlsTab,
    stage: { ...d.stage, ...input.stage },
    sections: { ...d.sections, ...input.sections },
    session: { ...d.session, ...input.session },
    toolbar: { ...d.toolbar, ...input.toolbar },
    stageMenu: { ...d.stageMenu, ...input.stageMenu },
    series: { ...d.series, ...input.series },
    alert: { ...d.alert, ...input.alert },
    confirm: { ...d.confirm, ...input.confirm },
    findings: { ...d.findings, ...input.findings },
    dock: {
      ...d.dock,
      ...input.dock,
      presets: {
        mip: { ...d.dock.presets.mip, ...input.dock?.presets?.mip },
        tissue: { ...d.dock.presets.tissue, ...input.dock?.presets?.tissue },
        bone: { ...d.dock.presets.bone, ...input.dock?.presets?.bone },
      },
    },
    status: { ...d.status, ...input.status },
    mobile: {
      tabBar: input.mobile?.tabBar ?? d.mobile.tabBar,
      tabs: { ...d.mobile.tabs, ...input.mobile?.tabs },
    },
    rail: { ...d.rail, ...input.rail },
    export: { ...d.export, ...input.export },
  };
}

/**
 * Fills the `{name}` marks of a label with `values`. A mark with no value stays as it
 * is, so a typo in a host's label shows up on screen instead of vanishing.
 */
export function fillLabel(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (mark, name: string) =>
    name in values ? String(values[name]) : mark,
  );
}
