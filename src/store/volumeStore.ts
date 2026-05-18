import { create } from "zustand";
import type {
  ActiveMeasurement,
  ImportProgress,
  LoadedVolume,
  MeasurementPoint,
  PreparedVolumeFor3D,
  RenderPreset,
  SliceWindowLevel,
  SlicePlane,
  ToolbarState,
  VolumeCursor,
} from "@/types";

export type AppView = "import" | "viewer";

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
}

interface VolumeActions {
  setView: (v: AppView) => void;
  setVolume: (v: LoadedVolume, p: PreparedVolumeFor3D) => void;
  setCursor: (c: VolumeCursor) => void;
  setActivePlane: (p: SlicePlane) => void;
  setLoading: (s: Partial<VolumeState["loading"]>) => void;
  setError: (msg: string | null) => void;
  toggleToolbar: (key: keyof ToolbarState) => void;
  setWL: (wl: Partial<SliceWindowLevel>) => void;
  setWLDraft: (wl: Partial<SliceWindowLevel>) => void;
  setScrubVisible: (axis: SlicePlane, value: boolean) => void;
  setMeasurementFrom: (p: MeasurementPoint) => void;
  setMeasurementTo: (p: MeasurementPoint) => void;
  clearMeasurement: () => void;
  setRenderPreset: (preset: RenderPreset) => void;
  reset: () => void;
}

const initialState: VolumeState = {
  view: "import",
  volume: null,
  prepared3D: null,
  cursor: null,
  activePlane: "coronal",
  loading: {
    active: false,
    percent: 0,
    stage: "idle",
    current: 0,
    total: 0,
    message: "",
  },
  error: null,
  toolbar: { planes: false, rail: true, focus: false, dock: true },
  wl: { window: 3200, level: 1600 },
  wlDraft: { window: 3200, level: 1600 },
  scrubVisible: { coronal: true, sagittal: true, axial: true },
  measurement: null,
  renderPreset: "mip",
};

export const useVolumeStore = create<VolumeState & VolumeActions>((set) => ({
  ...initialState,
  setView: (view) => set({ view }),
  setVolume: (volume, prepared3D) =>
    set({
      volume,
      prepared3D,
      view: "viewer",
      cursor: {
        x: Math.floor(volume.meta.dims[0] / 2),
        y: Math.floor(volume.meta.dims[1] / 2),
        z: Math.floor(volume.meta.dims[2] / 2),
      },
      wl: volume.windowLevel,
      wlDraft: volume.windowLevel,
      measurement: null,
      renderPreset: "mip",
      error: null,
    }),
  setCursor: (cursor) =>
    set((state) => {
      const dims = state.volume?.meta.dims;
      if (!dims) return { cursor };
      const cl = (v: number, max: number) =>
        v < 0 ? 0 : v > max - 1 ? max - 1 : v;
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
    set((state) => ({
      toolbar: { ...state.toolbar, [key]: !state.toolbar[key] },
    })),
  setWL: (wl) => set((state) => ({ wl: { ...state.wl, ...wl } })),
  setWLDraft: (wl) =>
    set((state) => ({ wlDraft: { ...state.wlDraft, ...wl } })),
  setScrubVisible: (axis, value) =>
    set((state) => ({
      scrubVisible: { ...state.scrubVisible, [axis]: value },
    })),
  setMeasurementFrom: (p) =>
    set({ measurement: { from: p, to: null, distanceMm: null } }),
  setMeasurementTo: (p) =>
    set((state) => {
      if (!state.measurement) return {};
      const spacing =
        state.volume?.meta.spacing ?? ([1, 1, 1] as [number, number, number]);
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
  reset: () => set(initialState),
}));
