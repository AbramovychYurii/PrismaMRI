import type {
  ActiveMeasurement,
  ImportProgress,
  LoadedVolume,
  MeasurementPoint,
  MobileTab,
  PlanesMode,
  PreparedVolumeFor3D,
  RenderPreset,
  SlicePlane,
  SliceWindowLevel,
  ToolbarState,
  VolumeCursor,
} from '@/types';
import { create } from 'zustand';

export type AppView = 'import' | 'viewer';

interface VolumeState {
  view: AppView;
  volume: LoadedVolume | null;
  prepared3D: PreparedVolumeFor3D | null;
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
  /** Increments each time a snap-to-plane is requested. Hook watches for changes. */
  snapSeq: number;
  snapPlane: SlicePlane;
  /** Active tab on mobile layout. */
  mobileTab: MobileTab;
}

interface VolumeActions {
  setView: (v: AppView) => void;
  setVolume: (v: LoadedVolume, p: PreparedVolumeFor3D) => void;
  setCursor: (c: VolumeCursor) => void;
  setActivePlane: (p: SlicePlane) => void;
  setLoading: (s: Partial<VolumeState['loading']>) => void;
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
  requestSnapToView: (plane: SlicePlane) => void;
  setMobileTab: (tab: MobileTab) => void;
  reset: () => void;
}

const initialState: VolumeState = {
  view: 'import',
  volume: null,
  prepared3D: null,
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
    planes: 'off' satisfies PlanesMode,
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
  snapSeq: 0,
  snapPlane: 'coronal' satisfies SlicePlane,
  mobileTab: '3d' satisfies MobileTab,
};

export const useVolumeStore = create<VolumeState & VolumeActions>((set) => ({
  ...initialState,
  setView: (view) => set({ view }),
  setVolume: (volume, prepared3D) =>
    set({
      volume,
      prepared3D,
      view: 'viewer',
      cursor: {
        x: Math.floor(volume.meta.dims[0] / 2),
        y: Math.floor(volume.meta.dims[1] / 2),
        z: Math.floor(volume.meta.dims[2] / 2),
      },
      wl: volume.windowLevel,
      wlDraft: volume.windowLevel,
      measurement: null,
      renderPreset: 'mip',
      toolbar: initialState.toolbar,
      activePlane: initialState.activePlane,
      snapSeq: 0,
      error: null,
    }),
  setCursor: (cursor) =>
    set((state) => {
      const dims = state.volume?.meta.dims;
      if (!dims) return { cursor };
      const cl = (v: number, max: number) => (v < 0 ? 0 : v > max - 1 ? max - 1 : v);
      return {
        cursor: {
          x: cl(cursor.x, dims[0]),
          y: cl(cursor.y, dims[1]),
          z: cl(cursor.z, dims[2]),
        },
      };
    }),
  setActivePlane: (activePlane) => set({ activePlane }),
  setLoading: (s) =>
    set((state) => ({
      loading: { ...state.loading, ...s },
    })),
  setError: (error) => set({ error }),
  toggleToolbar: (key) =>
    set((state) => {
      const newVal = !state.toolbar[key];
      const patch: Partial<ToolbarState> = { [key]: newVal };
      // Enabling clip requires at least one visible plane — auto-activate if off.
      if (key === 'clip' && newVal && state.toolbar.planes === 'off') {
        patch.planes = 'active';
      }
      // Disabling clip removes the single-plane mode entirely.
      if (key === 'clip' && !newVal) {
        patch.planes = 'off';
      }
      return { toolbar: { ...state.toolbar, ...patch } };
    }),
  cyclePlanesMode: () =>
    set((state) => {
      const cycle: Record<PlanesMode, PlanesMode> = { off: 'active', active: 'all', all: 'off' };
      const nextPlanes = cycle[state.toolbar.planes];
      const patch: Partial<ToolbarState> = { planes: nextPlanes };
      // Turning planes off while clip is on → also disable clip.
      if (nextPlanes === 'off' && state.toolbar.clip) patch.clip = false;
      return { toolbar: { ...state.toolbar, ...patch } };
    }),
  setWL: (wl) => set((state) => ({ wl: { ...state.wl, ...wl } })),
  setWLDraft: (wl) => set((state) => ({ wlDraft: { ...state.wlDraft, ...wl } })),
  setScrubVisible: (axis, value) =>
    set((state) => ({
      scrubVisible: { ...state.scrubVisible, [axis]: value },
    })),
  setMeasurementFrom: (p) => set({ measurement: { from: p, to: null, distanceMm: null } }),
  setMeasurementTo: (p) =>
    set((state) => {
      if (!state.measurement) return {};
      const spacing = state.volume?.meta.spacing ?? ([1, 1, 1] as [number, number, number]);
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
      activePlane:
        mobileTab === 'coronal' || mobileTab === 'sagittal' || mobileTab === 'axial'
          ? mobileTab
          : state.activePlane,
    })),
  reset: () => set(initialState),
}));
