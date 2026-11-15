import type {
  ActiveMeasurement,
  Annotation,
  LoadResult,
  LoadedVolume,
  MeasurementPoint,
  RenderPreset,
  SeriesChoice,
  SliceWindowLevel,
  VolumeCursor,
} from '@prisma-mri/viewer-core';
import type { ViewerState, ViewerStore, ViewerStoreState } from './store';

/**
 * The public face of a viewer: what a host may read and which commands it may
 * give. The store behind it is free to change — rename a field, split an
 * action, swap zustand out — as long as this stays put. Everything not listed
 * here (panel focus, scrub handles, mobile tabs, snap requests …) is the
 * viewer's own business.
 */

export type ViewerLoadingState = ViewerState['loading'];

export type ViewerStatus =
  /** Nothing open and nothing loading. */
  'empty' | 'loading' | 'ready';

/** An immutable view of the viewer's state. A new object only when something in it changed. */
export interface ViewerSnapshot {
  status: ViewerStatus;
  volume: LoadedVolume | null;
  /** Stable ID of the open volume — keys findings in storage. */
  activeVolumeId: string | null;
  cursor: VolumeCursor | null;
  windowLevel: SliceWindowLevel;
  renderPreset: RenderPreset;
  /** Slab MIP thickness in mm; 0 is a single slice. */
  slabMm: number;
  annotations: Annotation[];
  activeAnnotationId: string | null;
  measurement: ActiveMeasurement | null;
  error: string | null;
  loading: ViewerLoadingState;
  /** Series of a source waiting for the user's choice (`resolveSeries`), else null. */
  pendingSeries: SeriesChoice[] | null;
  /** Focus mode: the chrome is folded away and the stage fills the viewer. */
  focusMode: boolean;
  /** Whether the control dock is open. */
  dockOpen: boolean;
}

export type ViewerSnapshotListener = (snapshot: ViewerSnapshot, previous: ViewerSnapshot) => void;

export interface ViewerApi {
  /** The current state. Same object until something changes. */
  getSnapshot: () => ViewerSnapshot;
  /** Calls `listener` after each change to the snapshot. Returns the unsubscribe function. */
  subscribe: (listener: ViewerSnapshotListener) => () => void;

  /** Moves the crosshair. Voxel coordinates are clamped to the open volume. */
  setCursor: (cursor: VolumeCursor) => void;
  /** Sets window and level for the slices, and the live drag value with them. */
  setWindowLevel: (windowLevel: SliceWindowLevel) => void;
  /** Switches the 3-D render preset. Resets the window and level to the volume's defaults. */
  setRenderPreset: (preset: RenderPreset) => void;
  /** Slab MIP thickness in mm for every panel; 0 for a single slice. */
  setSlabMm: (mm: number) => void;
  /** Places a measurement between two voxels; `distanceMm` is computed from the spacing. */
  setMeasurement: (from: MeasurementPoint, to: MeasurementPoint) => void;
  clearMeasurement: () => void;

  /** Adds a finding to the open volume. No-op without one. */
  addAnnotation: (annotation: Omit<Annotation, 'volumeId'>) => void;
  /** Replaces every finding on the open volume at once. */
  replaceAnnotations: (annotations: Omit<Annotation, 'volumeId'>[]) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
  /** Marks a finding as the active one (card and marker emphasis), or none. */
  setActiveAnnotation: (id: string | null) => void;
  /** Jumps the crosshair and plane to a finding and makes it active. */
  focusAnnotation: (id: string) => void;

  /**
   * Opens a volume the host kept elsewhere (a cache) without resetting the UI
   * state restored from persistence — cursor, window and level, toolbar.
   */
  restoreVolume: (result: Pick<LoadResult, 'volume' | 'prepared3D' | 'histogram'>) => void;
  /**
   * Ends the loading state once the host has put the viewer on screen. A load
   * leaves it on through the host's screen swap so nothing flashes back.
   */
  finishLoading: () => void;
  /** Shows an error message, or clears it with null. */
  setError: (message: string | null) => void;
  /** Closes the volume and puts the viewer back to its starting state. */
  reset: () => void;
}

const PICKED = [
  'volume',
  'activeVolumeId',
  'cursor',
  'renderPreset',
  'slabMm',
  'annotations',
  'activeAnnotationId',
  'measurement',
  'error',
  'loading',
  'pendingSeries',
] as const satisfies readonly (keyof ViewerStoreState)[];

function snapshotOf(state: ViewerStoreState, previous: ViewerSnapshot | null): ViewerSnapshot {
  const next: ViewerSnapshot = {
    status: state.volume ? 'ready' : state.loading.active ? 'loading' : 'empty',
    volume: state.volume,
    activeVolumeId: state.activeVolumeId,
    cursor: state.cursor,
    windowLevel: state.wl,
    renderPreset: state.renderPreset,
    slabMm: state.slabMm,
    annotations: state.annotations,
    activeAnnotationId: state.activeAnnotationId,
    measurement: state.measurement,
    error: state.error,
    loading: state.loading,
    pendingSeries: state.pendingSeries,
    focusMode: state.toolbar.focus,
    dockOpen: state.toolbar.dock,
  };
  if (!previous) return next;
  // Reuse the old object when nothing it shows has moved, so selectors and
  // subscribers can compare by identity.
  const same =
    next.status === previous.status &&
    next.windowLevel === previous.windowLevel &&
    next.focusMode === previous.focusMode &&
    next.dockOpen === previous.dockOpen &&
    PICKED.every((key) => next[key] === previous[key]);
  return same ? previous : next;
}

/** The facade over one viewer's store. */
export function createViewerApi(
  store: ViewerStore,
  /** Collects every live subscription, so the owner can drop them all at once. */
  owned: Set<() => void> = new Set(),
): ViewerApi {
  let last: ViewerSnapshot | null = null;
  const read = (): ViewerSnapshot => {
    last = snapshotOf(store.getState(), last);
    return last;
  };
  const act = () => store.getState();

  return {
    getSnapshot: read,

    subscribe(listener) {
      let seen = read();
      const stop = store.subscribe(() => {
        const next = read();
        if (next === seen) return;
        const previous = seen;
        seen = next;
        listener(next, previous);
      });
      const off = () => {
        owned.delete(off);
        stop();
      };
      owned.add(off);
      return off;
    },

    setCursor: (cursor) => act().setCursor(cursor),

    setWindowLevel(windowLevel) {
      const { setWL, setWLDraft } = act();
      setWL(windowLevel);
      setWLDraft(windowLevel);
    },

    setRenderPreset: (preset) => act().setRenderPreset(preset),
    setSlabMm: (mm) => act().setSlabMm(mm),

    setMeasurement(from, to) {
      const { setMeasurementFrom, setMeasurementTo } = act();
      setMeasurementFrom(from);
      setMeasurementTo(to);
    },
    clearMeasurement: () => act().clearMeasurement(),

    addAnnotation: (annotation) => act().addAnnotation(annotation),
    replaceAnnotations: (annotations) => act().setAnnotations(annotations),
    removeAnnotation: (id) => act().removeAnnotation(id),
    clearAnnotations: () => act().clearAnnotations(),
    setActiveAnnotation: (id) => act().setActiveAnnotation(id),
    focusAnnotation: (id) => act().focusAnnotation(id),

    restoreVolume: ({ volume, prepared3D, histogram }) =>
      act().restoreVolume(volume, prepared3D, histogram),
    finishLoading: () =>
      act().setLoading({ active: false, percent: 100, stage: 'done', message: 'Ready' }),
    setError: (message) => act().setError(message),
    reset: () => act().reset(),
  };
}
