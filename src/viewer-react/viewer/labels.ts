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
  };
}
