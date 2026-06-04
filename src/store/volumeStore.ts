import { isSlicePlane } from '@/constants';
import * as annotationsStorage from '@/lib/annotationsStorage';
import type { ThreePreview } from '@/lib/volume/three-preview';
import { deriveVolumeId } from '@/lib/volumeId';
import type {
  ActiveMeasurement,
  AiAnnotation,
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
  VolumeHistogram,
} from '@/types';
import { create } from 'zustand';

interface VolumeState {
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
  /** Stable ID of the currently loaded volume (null when no volume is open). */
  activeVolumeId: string | null;
  /** AI annotation findings for the active volume only. */
  aiAnnotations: AiAnnotation[];
  /** Currently focused finding — drives the summary card + marker emphasis. */
  activeAnnotationId: string | null;
  /** True while the MCP server is connected via the relay. */
  mcpConnected: boolean;
  /** Port used for the active local direct connection, or null when using relay. */
  localPort: number | null;
  /** Set while the agent is executing a command — drives the activity indicator. */
  agentActivity: { active: boolean; action: string | null };
  /** True for the entire duration of an agent prompt session (first cmd → inactivity/disconnect). */
  agentSessionActive: boolean;
  /** Canvas refs registered by each SlicePanel so useMcpBridge can capture them. */
  canvasRefs: Record<SlicePlane, HTMLCanvasElement | null>;
  /** Live 3-D preview instance, registered by useThreePreview (for capture + markers). */
  previewInstance: ThreePreview | null;
}

interface VolumeActions {
  setVolume: (v: LoadedVolume, p: PreparedVolumeFor3D, h: VolumeHistogram) => void;
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
  setSlabMm: (mm: number) => void;
  requestSnapToView: (plane: SlicePlane) => void;
  setMobileTab: (tab: MobileTab) => void;
  addAiAnnotation: (a: Omit<AiAnnotation, 'volumeId'>) => void;
  /** Atomically replace all annotations for the active volume (used by demo loader). */
  setAiAnnotations: (list: Omit<AiAnnotation, 'volumeId'>[]) => void;
  removeAiAnnotation: (id: string) => void;
  clearAiAnnotations: () => void;
  setActiveAnnotation: (id: string | null) => void;
  /** Jump the cursor/active plane to a finding and mark it active. */
  focusAnnotation: (id: string) => void;
  setMcpConnected: (v: boolean) => void;
  setLocalPort: (port: number | null) => void;
  setAgentActivity: (active: boolean, action?: string | null) => void;
  setAgentSessionActive: (v: boolean) => void;
  setCanvasRef: (plane: SlicePlane, canvas: HTMLCanvasElement | null) => void;
  setPreviewInstance: (p: ThreePreview | null) => void;
  reset: () => void;
}

const DEFAULT_SPACING: [number, number, number] = [1, 1, 1];

const initialState: VolumeState = {
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
  activeVolumeId: null,
  aiAnnotations: [],
  activeAnnotationId: null,
  mcpConnected: false,
  localPort: null,
  agentActivity: { active: false, action: null },
  agentSessionActive: false,
  canvasRefs: { coronal: null, sagittal: null, axial: null },
  previewInstance: null,
};

export const useVolumeStore = create<VolumeState & VolumeActions>((set) => ({
  ...initialState,

  setVolume: (volume, prepared3D, histogram) => {
    const activeVolumeId = deriveVolumeId(volume);
    const aiAnnotations = annotationsStorage.load(activeVolumeId);
    set({
      volume,
      prepared3D,
      histogram,
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
      activeVolumeId,
      aiAnnotations,
      activeAnnotationId: null,
    });
  },

  setCursor: (cursor) =>
    set((state) => {
      const dims = state.volume?.meta.dims;
      if (!dims) return { cursor };
      const clampAxis = (v: number, max: number) => Math.max(0, Math.min(max - 1, v));
      return {
        cursor: {
          x: clampAxis(cursor.x, dims[0]),
          y: clampAxis(cursor.y, dims[1]),
          z: clampAxis(cursor.z, dims[2]),
        },
      };
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

  addAiAnnotation: (a) =>
    set((state) => {
      if (!state.activeVolumeId) return {};
      const tagged = { ...a, volumeId: state.activeVolumeId };
      const next = [...state.aiAnnotations, tagged];
      annotationsStorage.save(state.activeVolumeId, next);
      return { aiAnnotations: next };
    }),

  setAiAnnotations: (list) =>
    set((state) => {
      if (!state.activeVolumeId) return {};
      const volumeId = state.activeVolumeId;
      const tagged = list.map((a) => ({ ...a, volumeId }));
      annotationsStorage.save(volumeId, tagged);
      return { aiAnnotations: tagged, activeAnnotationId: null };
    }),

  removeAiAnnotation: (id) =>
    set((state) => {
      const next = state.aiAnnotations.filter((a) => a.id !== id);
      if (state.activeVolumeId) annotationsStorage.save(state.activeVolumeId, next);
      return {
        aiAnnotations: next,
        activeAnnotationId: state.activeAnnotationId === id ? null : state.activeAnnotationId,
      };
    }),

  clearAiAnnotations: () =>
    set((state) => {
      if (state.activeVolumeId) annotationsStorage.clear(state.activeVolumeId);
      return { aiAnnotations: [], activeAnnotationId: null };
    }),

  setActiveAnnotation: (activeAnnotationId) => set({ activeAnnotationId }),

  focusAnnotation: (id) =>
    set((state) => {
      const a = state.aiAnnotations.find((x) => x.id === id);
      if (!a) return {};
      const dims = state.volume?.meta.dims;
      const clampAxis = (v: number, max: number) => Math.max(0, Math.min(max - 1, v));
      const cursor = dims
        ? {
            x: clampAxis(a.voxel.x, dims[0]),
            y: clampAxis(a.voxel.y, dims[1]),
            z: clampAxis(a.voxel.z, dims[2]),
          }
        : a.voxel;
      return { cursor, activePlane: a.plane, activeAnnotationId: id };
    }),

  setMcpConnected: (mcpConnected) => set({ mcpConnected }),
  setLocalPort: (localPort) => set({ localPort }),

  setAgentActivity: (active, action = null) =>
    set({ agentActivity: { active, action: active ? (action ?? null) : null } }),

  setAgentSessionActive: (agentSessionActive) => set({ agentSessionActive }),

  setCanvasRef: (plane, canvas) =>
    set((state) => ({ canvasRefs: { ...state.canvasRefs, [plane]: canvas } })),

  setPreviewInstance: (previewInstance) => set({ previewInstance }),

  reset: () => set(initialState),
}));
