import {
  type ActiveMeasurement,
  type Annotation,
  type ImportProgress,
  type ImportSource,
  type LoadedVolume,
  type MeasurementPoint,
  type PlanesMode,
  type PreparedVolumeFor3D,
  type RenderPreset,
  type SeriesChoice,
  type SlicePlane,
  type SliceWindowLevel,
  type VolumeCursor,
  type VolumeHistogram,
  clampToDims,
  deriveVolumeId,
  volumeCenter,
} from '@prisma-mri/viewer-core';
import { type StoreApi, createStore } from 'zustand';
import { type StateStorage, createJSONStorage, persist } from 'zustand/middleware';
import { isSlicePlane } from '../constants';
import type { MobileTab, ToolbarState } from '../types';

export interface ViewerState {
  volume: LoadedVolume | null;
  prepared3D: PreparedVolumeFor3D | null;
  histogram: VolumeHistogram | null;
  cursor: VolumeCursor | null;
  activePlane: SlicePlane | null;
  loading: ImportProgress & { active: boolean; percent: number };
  error: string | null;
  toolbar: ToolbarState;
  wl: SliceWindowLevel;
  wlDraft: SliceWindowLevel;
  scrubVisible: Record<SlicePlane, boolean>;
  measurement: ActiveMeasurement | null;
  renderPreset: RenderPreset;
  /** Slab MIP thickness in mm — 0 = single slice. Applies to all panels. */
  slabMm: number;
  /** Increments each time a snap-to-plane is requested. Hook watches for changes. */
  snapSeq: number;
  snapPlane: SlicePlane;
  /** Active tab on mobile layout. */
  mobileTab: MobileTab;
  /**
   * Plane currently shown fullscreen, or null. Lifted out of SlicePanel so the
   * expanded view *replaces* its rail panel instead of mounting alongside it —
   * otherwise the same plane runs two panel cores, two canvas painters and two
   * annotation overlays at once.
   */
  expandedPlane: SlicePlane | null;
  /** Stable ID of the currently loaded volume (null when no volume is open). */
  activeVolumeId: string | null;
  /** Findings placed on the active volume only. */
  annotations: Annotation[];
  /** Currently focused finding — drives the summary card + marker emphasis. */
  activeAnnotationId: string | null;
  /**
   * Multi-series import context — retained so the stage series-switcher can
   * re-assemble a different series without re-importing. Session-only (holds
   * File objects; never persisted). Null unless the active volume came from a
   * multi-series source in this session.
   */
  seriesSource: ImportSource | null;
  seriesList: SeriesChoice[] | null;
  activeSeriesKey: string | null;
  /**
   * Series of a source being loaded, while the load waits for the user to pick
   * one (answered with `viewer.resolveSeries`). Null otherwise.
   */
  pendingSeries: SeriesChoice[] | null;
}

export interface ViewerActions {
  setVolume: (v: LoadedVolume, p: PreparedVolumeFor3D, h: VolumeHistogram) => void;
  /**
   * Restore a volume from a cache without resetting UI state.
   * Used on page reload — the persisted UI state (cursor, W/L, toolbar, render
   * preset, slab thickness, …) is rehydrated independently, so we must NOT
   * clobber it the way `setVolume` does for a fresh import.
   * Cursor is clamped to the restored volume's dims in case the persisted
   * cursor pointed past the new dims (defensive — same tab keeps same dims).
   */
  restoreVolume: (v: LoadedVolume, p: PreparedVolumeFor3D, h: VolumeHistogram) => void;
  setCursor: (c: VolumeCursor) => void;
  setActivePlane: (p: SlicePlane) => void;
  setLoading: (s: Partial<ViewerState['loading']>) => void;
  setError: (msg: string | null) => void;
  toggleToolbar: (key: Exclude<keyof ToolbarState, 'planes'>) => void;
  cyclePlanesMode: () => void;
  setWL: (wl: Partial<SliceWindowLevel>) => void;
  setWLDraft: (wl: Partial<SliceWindowLevel>) => void;
  setScrubVisible: (axis: SlicePlane, value: boolean) => void;
  setMeasurementFrom: (p: MeasurementPoint) => void;
  setMeasurementTo: (p: MeasurementPoint) => void;
  clearMeasurement: () => void;
  setRenderPreset: (preset: RenderPreset) => void;
  setSlabMm: (mm: number) => void;
  requestSnapToView: (plane: SlicePlane) => void;
  setMobileTab: (tab: MobileTab) => void;
  setExpandedPlane: (plane: SlicePlane | null) => void;
  addAnnotation: (a: Omit<Annotation, 'volumeId'>) => void;
  /** Atomically replace all annotations for the active volume (used by demo loader). */
  setAnnotations: (list: Omit<Annotation, 'volumeId'>[]) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
  setActiveAnnotation: (id: string | null) => void;
  /** Jump the cursor/active plane to a finding and mark it active. */
  focusAnnotation: (id: string) => void;
  /** Retain the source + series list so the stage can switch series in place. */
  setSeriesContext: (source: ImportSource, list: SeriesChoice[], activeKey: string | null) => void;
  /** Drop the series context (single-series / non-DICOM load). */
  clearSeriesContext: () => void;
  reset: () => void;
}

export type ViewerStoreState = ViewerState & ViewerActions;
export type ViewerStore = StoreApi<ViewerStoreState>;

/** Where a viewer keeps the findings placed on each volume, keyed by volume ID. */
export interface AnnotationStorage {
  load: (volumeId: string) => Annotation[];
  save: (volumeId: string, annotations: Annotation[]) => void;
  clear: (volumeId: string) => void;
}

export interface ViewerStoreOptions {
  /**
   * Persist the UI state (cursor, W/L, toolbar, preset, …) across reloads.
   * Off by default: an embedded viewer must not write to the host's storage
   * unless the host asks it to.
   */
  persistence?: { key: string; storage: StateStorage };
  /** Where findings live between loads. Defaults to memory only. */
  annotationStorage?: AnnotationStorage;
}

/** Keeps findings for the life of the store and nowhere else. */
function memoryAnnotationStorage(): AnnotationStorage {
  const slots = new Map<string, Annotation[]>();
  return {
    load: (id) => slots.get(id) ?? [],
    save: (id, list) => void slots.set(id, list),
    clear: (id) => void slots.delete(id),
  };
}

const DEFAULT_SPACING: [number, number, number] = [1, 1, 1];

const initialState: ViewerState = {
  volume: null,
  prepared3D: null,
  histogram: null,
  cursor: null,
  activePlane: 'coronal',
  loading: {
    active: false,
    percent: 0,
    stage: 'idle',
    current: 0,
    total: 0,
    message: '',
  },
  error: null,
  toolbar: {
    planes: 'off',
    clip: false,
    rail: true,
    focus: false,
    dock: true,
  },
  wl: { window: 3200, level: 1600 },
  wlDraft: { window: 3200, level: 1600 },
  scrubVisible: { coronal: true, sagittal: true, axial: true },
  measurement: null,
  renderPreset: 'mip',
  slabMm: 0,
  snapSeq: 0,
  snapPlane: 'coronal',
  mobileTab: '3d',
  expandedPlane: null,
  activeVolumeId: null,
  annotations: [],
  activeAnnotationId: null,
  seriesSource: null,
  seriesList: null,
  activeSeriesKey: null,
  pendingSeries: null,
};

/** The part of the state worth restoring after a reload. */
function persistedSlice(state: ViewerStoreState) {
  return {
    cursor: state.cursor,
    activePlane: state.activePlane,
    toolbar: state.toolbar,
    wl: state.wl,
    wlDraft: state.wlDraft,
    scrubVisible: state.scrubVisible,
    measurement: state.measurement,
    renderPreset: state.renderPreset,
    slabMm: state.slabMm,
    mobileTab: state.mobileTab,
    activeAnnotationId: state.activeAnnotationId,
  };
}

function viewerState(
  set: StoreApi<ViewerStoreState>['setState'],
  annotationStorage: AnnotationStorage,
): ViewerStoreState {
  return {
    ...initialState,

    setVolume: (volume, prepared3D, histogram) => {
      const activeVolumeId = deriveVolumeId(volume);
      const annotations = annotationStorage.load(activeVolumeId);
      set({
        volume,
        prepared3D,
        histogram,
        cursor: volumeCenter(volume.meta.dims),
        wl: volume.windowLevel,
        wlDraft: volume.windowLevel,
        measurement: null,
        renderPreset: 'mip',
        toolbar: initialState.toolbar,
        activePlane: initialState.activePlane,
        snapSeq: 0,
        error: null,
        activeVolumeId,
        annotations,
        activeAnnotationId: null,
      });
    },

    restoreVolume: (volume, prepared3D, histogram) => {
      const activeVolumeId = deriveVolumeId(volume);
      const annotations = annotationStorage.load(activeVolumeId);
      const dims = volume.meta.dims;
      set((state) => ({
        volume,
        prepared3D,
        histogram,
        activeVolumeId,
        annotations,
        cursor: state.cursor ? clampToDims(state.cursor, dims) : volumeCenter(dims),
        activeAnnotationId: annotations.some((a) => a.id === state.activeAnnotationId)
          ? state.activeAnnotationId
          : null,
        error: null,
      }));
    },

    setCursor: (cursor) =>
      set((state) => {
        const dims = state.volume?.meta.dims;
        return { cursor: dims ? clampToDims(cursor, dims) : cursor };
      }),

    setActivePlane: (activePlane) => set({ activePlane }),

    setLoading: (s) => set((state) => ({ loading: { ...state.loading, ...s } })),

    setError: (error) => set({ error }),

    toggleToolbar: (key) =>
      set((state) => {
        const nextValue = !state.toolbar[key];
        const patch: Partial<ToolbarState> = { [key]: nextValue };
        // Enabling clip requires at least one visible plane — auto-activate if off.
        if (key === 'clip' && nextValue && state.toolbar.planes === 'off') patch.planes = 'active';
        // Disabling clip removes the single-plane mode entirely.
        if (key === 'clip' && !nextValue) patch.planes = 'off';
        return { toolbar: { ...state.toolbar, ...patch } };
      }),

    cyclePlanesMode: () =>
      set((state) => {
        const cycle: Record<PlanesMode, PlanesMode> = {
          off: 'active',
          active: 'all',
          all: 'off',
        };
        const nextPlanes = cycle[state.toolbar.planes];
        const patch: Partial<ToolbarState> = { planes: nextPlanes };
        // Turning planes off while clip is on → also disable clip.
        if (nextPlanes === 'off' && state.toolbar.clip) patch.clip = false;
        return { toolbar: { ...state.toolbar, ...patch } };
      }),

    setWL: (wl) => set((state) => ({ wl: { ...state.wl, ...wl } })),

    setWLDraft: (wl) => set((state) => ({ wlDraft: { ...state.wlDraft, ...wl } })),

    setScrubVisible: (axis, value) =>
      set((state) => ({ scrubVisible: { ...state.scrubVisible, [axis]: value } })),

    setMeasurementFrom: (p) => set({ measurement: { from: p, to: null, distanceMm: null } }),

    setMeasurementTo: (p) =>
      set((state) => {
        if (!state.measurement) return {};
        const spacing = state.volume?.meta.spacing ?? DEFAULT_SPACING;
        const { from } = state.measurement;
        const dx = (p.x - from.x) * spacing[0];
        const dy = (p.y - from.y) * spacing[1];
        const dz = (p.z - from.z) * spacing[2];
        return {
          measurement: {
            from,
            to: p,
            distanceMm: Math.sqrt(dx * dx + dy * dy + dz * dz),
          },
        };
      }),

    clearMeasurement: () => set({ measurement: null }),

    setRenderPreset: (renderPreset) =>
      set((state) => {
        const defaultWL = state.volume?.windowLevel ?? state.wl;
        return { renderPreset, wl: defaultWL, wlDraft: defaultWL };
      }),

    setSlabMm: (slabMm) => set({ slabMm }),

    requestSnapToView: (plane) =>
      set((state) => ({
        snapSeq: state.snapSeq + 1,
        snapPlane: plane,
        // Sync the active plane so clip / plane-indicator match the snapped view.
        activePlane: plane,
      })),

    setMobileTab: (mobileTab) =>
      set((state) => ({
        mobileTab,
        // Sync activePlane when switching to a slice tab.
        activePlane: isSlicePlane(mobileTab) ? mobileTab : state.activePlane,
      })),

    setExpandedPlane: (expandedPlane) =>
      set((state) => ({
        expandedPlane,
        // Expanding focuses the plane, so the first click moves the crosshair
        // rather than only selecting the panel.
        activePlane: expandedPlane ?? state.activePlane,
      })),

    addAnnotation: (a) =>
      set((state) => {
        if (!state.activeVolumeId) return {};
        const tagged = { ...a, volumeId: state.activeVolumeId };
        const next = [...state.annotations, tagged];
        annotationStorage.save(state.activeVolumeId, next);
        return { annotations: next };
      }),

    setAnnotations: (list) =>
      set((state) => {
        if (!state.activeVolumeId) return {};
        const volumeId = state.activeVolumeId;
        const tagged = list.map((a) => ({ ...a, volumeId }));
        annotationStorage.save(volumeId, tagged);
        return { annotations: tagged, activeAnnotationId: null };
      }),

    removeAnnotation: (id) =>
      set((state) => {
        const next = state.annotations.filter((a) => a.id !== id);
        if (state.activeVolumeId) annotationStorage.save(state.activeVolumeId, next);
        return {
          annotations: next,
          activeAnnotationId: state.activeAnnotationId === id ? null : state.activeAnnotationId,
        };
      }),

    clearAnnotations: () =>
      set((state) => {
        if (state.activeVolumeId) annotationStorage.clear(state.activeVolumeId);
        return { annotations: [], activeAnnotationId: null };
      }),

    setActiveAnnotation: (activeAnnotationId) => set({ activeAnnotationId }),

    focusAnnotation: (id) =>
      set((state) => {
        const finding = state.annotations.find((a) => a.id === id);
        if (!finding) return {};
        const dims = state.volume?.meta.dims;
        return {
          cursor: dims ? clampToDims(finding.voxel, dims) : finding.voxel,
          activePlane: finding.plane,
          activeAnnotationId: id,
        };
      }),

    setSeriesContext: (seriesSource, seriesList, activeSeriesKey) =>
      set({ seriesSource, seriesList, activeSeriesKey }),
    clearSeriesContext: () => set({ seriesSource: null, seriesList: null, activeSeriesKey: null }),

    reset: () => set(initialState),
  };
}

/**
 * One viewer's state. Each call is independent, so two viewers on a page never
 * share a cursor, W/L or findings.
 */
export function createViewerStore(options: ViewerStoreOptions = {}): ViewerStore {
  const annotationStorage = options.annotationStorage ?? memoryAnnotationStorage();
  const { persistence } = options;
  if (!persistence) {
    return createStore<ViewerStoreState>()((set) => viewerState(set, annotationStorage));
  }
  return createStore<ViewerStoreState>()(
    persist((set) => viewerState(set, annotationStorage), {
      name: persistence.key,
      storage: createJSONStorage(() => persistence.storage),
      version: 1,
      partialize: persistedSlice,
    }),
  );
}
