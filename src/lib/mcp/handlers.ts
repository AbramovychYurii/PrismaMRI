import { clamp } from '@/lib/volume/math';
import {
  clampToDims,
  fracToVoxel,
  slabHalfSlices,
  sliceAxis,
  sliceCount,
  sliceIndex,
  sliceNumber,
  volumeCenter,
} from '@/lib/volume/plane';
import { extractSliceGrayImage } from '@/lib/volume/slices';
import { useVolumeStore } from '@/store/volumeStore';
import type {
  AiAnnotation,
  LoadedVolume,
  MeasurementPoint,
  SlicePlane,
  VolumeCursor,
} from '@/types';

import { captureCanvas, renderSliceForMcp, waitForPaint } from './canvas-utils';
import { MCP_JPEG_QUALITY, MCP_MAX_EDGE, WL_PRESETS } from './constants';
import {
  optionalNumber,
  optionalSeverity,
  optionalString,
  requireFraction,
  requireNumber,
  requireOneOf,
  requirePlane,
  requireString,
} from './validate';
import { snapToAnatomy } from './voxel-utils';

/** Free-form message body — handlers narrow individual fields as needed. */
export type HandlerMessage = Record<string, unknown> & { id: string; action: string };

export interface HandlerContext {
  msg: HandlerMessage;
  ok: (data?: unknown) => void;
  fail: (error: string) => void;
}

export type Handler = (ctx: HandlerContext) => void | Promise<void>;

type VolumeStoreState = ReturnType<typeof useVolumeStore.getState>;
type LoadedState = VolumeStoreState & { volume: LoadedVolume; cursor: VolumeCursor };

/**
 * Reports "No volume loaded" and returns null unless a volume is open. The
 * store only ever sets a cursor alongside a volume, so both are narrowed here.
 */
function requireLoaded(fail: (error: string) => void): LoadedState | null {
  const state = useVolumeStore.getState();
  if (!state.volume || !state.cursor) {
    fail('No volume loaded');
    return null;
  }
  return state as LoadedState;
}

function sliceNumbers(cursor: VolumeCursor) {
  return {
    coronal: sliceNumber(cursor, 'coronal'),
    sagittal: sliceNumber(cursor, 'sagittal'),
    axial: sliceNumber(cursor, 'axial'),
  };
}

function sliceTotals(dims: readonly [number, number, number]) {
  return {
    coronal: sliceCount(dims, 'coronal'),
    sagittal: sliceCount(dims, 'sagittal'),
    axial: sliceCount(dims, 'axial'),
  };
}

function sliceImagesAt(state: LoadedState, cursor: VolumeCursor) {
  const render = (plane: SlicePlane) =>
    renderSliceForMcp(
      extractSliceGrayImage(state.volume, plane, sliceIndex(cursor, plane), state.wl, 0),
    );
  return { coronal: render('coronal'), sagittal: render('sagittal'), axial: render('axial') };
}

const handleGetState: Handler = ({ ok }) => {
  const { volume, cursor, wl, renderPreset } = useVolumeStore.getState();
  const dims = volume?.meta.dims ?? null;
  ok({
    volumeLoaded: volume !== null,
    dims,
    spacing: volume?.meta.spacing ?? null,
    cursor,
    sliceIndices: cursor && dims ? sliceNumbers(cursor) : null,
    sliceTotals: dims ? sliceTotals(dims) : null,
    wl,
    preset: renderPreset,
  });
};

const handleOverview: Handler = ({ ok, fail }) => {
  const state = requireLoaded(fail);
  if (!state) return;

  const { dims, spacing, modality, scanner, protocol } = state.volume.meta;
  const center = volumeCenter(dims);
  state.setCursor(center);

  ok({
    meta: {
      dims,
      spacing,
      modality,
      scanner,
      protocol,
      scalarMin: state.volume.scalarMin,
      scalarMax: state.volume.scalarMax,
      formatId: state.volume.formatId,
    },
    cursor: center,
    sliceIndices: sliceNumbers(center),
    images: sliceImagesAt(state, center),
  });
};

const handleNavigate: Handler = ({ msg, ok, fail }) => {
  const state = requireLoaded(fail);
  if (!state) return;
  const plane = requirePlane(msg);
  const slice = requireNumber(msg, 'slice');
  const dims = state.volume.meta.dims;
  state.setCursor(clampToDims({ ...state.cursor, [sliceAxis(plane)]: slice - 1 }, dims));
  ok();
};

const handleStep: Handler = ({ msg, ok, fail }) => {
  const state = requireLoaded(fail);
  if (!state) return;
  const plane = requirePlane(msg);
  const steps = requireNumber(msg, 'steps');
  const dims = state.volume.meta.dims;
  const next = clampToDims(
    { ...state.cursor, [sliceAxis(plane)]: sliceIndex(state.cursor, plane) + steps },
    dims,
  );
  state.setCursor(next);
  ok({ slice: sliceNumber(next, plane), total: sliceCount(dims, plane) });
};

const handleNavigateCenter: Handler = ({ ok, fail }) => {
  const state = requireLoaded(fail);
  if (!state) return;
  const center = volumeCenter(state.volume.meta.dims);
  state.setCursor(center);
  ok({ sliceIndices: sliceNumbers(center) });
};

const handleSetWl: Handler = ({ msg, ok }) => {
  const wl = { window: requireNumber(msg, 'window'), level: requireNumber(msg, 'level') };
  const { setWL, setWLDraft } = useVolumeStore.getState();
  setWL(wl);
  setWLDraft(wl);
  ok();
};

const handleApplyWlPreset: Handler = ({ msg, ok, fail }) => {
  const state = requireLoaded(fail);
  if (!state) return;
  // Named rather than defaulted: silently applying full_range for a typo left
  // the agent reasoning about contrast it never asked for.
  const preset = requireOneOf(msg, 'preset', Object.keys(WL_PRESETS));
  const [windowFrac, levelFrac] = WL_PRESETS[preset];
  const range = state.volume.scalarMax - state.volume.scalarMin;
  const wl = { window: range * windowFrac, level: state.volume.scalarMin + range * levelFrac };
  state.setWL(wl);
  state.setWLDraft(wl);
  ok(wl);
};

const handleSetPreset: Handler = ({ msg, ok, fail }) => {
  if (msg.preset === 'tissue') {
    fail(
      '"tissue" preset is not available via MCP — ' +
        'it requires full per-voxel compositing which exceeds the capture time budget. ' +
        'Use "bone" for skeletal/dental CT or "mip" for overview.',
    );
    return;
  }
  useVolumeStore.getState().setRenderPreset(requireOneOf(msg, 'preset', ['mip', 'bone'] as const));
  ok();
};

const MAX_SLAB_MM = 50;

const handleSetSlabMm: Handler = ({ msg, ok, fail }) => {
  const requested = Number(msg.slab_mm);
  if (!Number.isFinite(requested) || requested < 0) {
    fail('slab_mm must be a non-negative number');
    return;
  }
  const slabMm = Math.min(MAX_SLAB_MM, requested);
  useVolumeStore.getState().setSlabMm(slabMm);
  ok({ slabMm });
};

const handleCaptureSlice: Handler = async ({ msg, ok, fail }) => {
  const plane = requirePlane(msg);
  const slabMm = optionalNumber(msg, 'slab_mm', 0);

  // A slab renders straight from the voxel buffer: sharper than a canvas grab
  // and independent of the panel's own slab setting.
  if (slabMm > 0) {
    const state = requireLoaded(fail);
    if (!state) return;
    const { volume, cursor, wl } = state;
    const half = slabHalfSlices(plane, slabMm, volume.meta.spacing);
    const image = extractSliceGrayImage(volume, plane, sliceIndex(cursor, plane), wl, half);
    ok({ imageData: renderSliceForMcp(image), slabMm });
    return;
  }

  const canvas = useVolumeStore.getState().canvasRefs[plane];
  if (!canvas) {
    fail(`Canvas for ${plane} not available`);
    return;
  }
  await waitForPaint();
  ok({ imageData: captureCanvas(canvas) });
};

const handleCapture3d: Handler = async ({ ok, fail }) => {
  const preview = useVolumeStore.getState().previewInstance;
  if (!preview) {
    fail('3-D view not ready');
    return;
  }
  await waitForPaint();
  ok({ imageData: preview.captureJpeg(MCP_MAX_EDGE, MCP_JPEG_QUALITY) });
};

const handleCaptureAll: Handler = ({ ok, fail }) => {
  const state = requireLoaded(fail);
  if (!state) return;
  ok(sliceImagesAt(state, state.cursor));
};

/** Slab thickness for the overview grid — improves lesion visibility without hiding margins. */
const OVERVIEW_GRID_SLAB_MM = 3;

const handleOverviewGrid: Handler = ({ msg, ok, fail }) => {
  const state = requireLoaded(fail);
  if (!state) return;
  const plane = requirePlane(msg);
  const count = clamp(optionalNumber(msg, 'count', 4), 2, 4);
  const { volume, wl } = state;
  const total = sliceCount(volume.meta.dims, plane);
  const half = slabHalfSlices(plane, OVERVIEW_GRID_SLAB_MM, volume.meta.spacing);

  const indices = Array.from({ length: count }, (_, i) =>
    Math.round(1 + (i / (count - 1)) * (total - 1)),
  );
  const images = indices.map((slice) =>
    renderSliceForMcp(extractSliceGrayImage(volume, plane, slice - 1, wl, half)),
  );

  ok({ images, indices, total });
};

const handleAddAnnotation: Handler = ({ msg, ok, fail }) => {
  const state = requireLoaded(fail);
  if (!state) return;

  const plane = requirePlane(msg);
  const fx = requireFraction(msg, 'fx');
  const fy = requireFraction(msg, 'fy');
  const rawConfidence = msg.confidence == null ? undefined : requireNumber(msg, 'confidence');

  const annotation: Omit<AiAnnotation, 'volumeId'> = {
    id: crypto.randomUUID(),
    plane,
    fx,
    fy,
    voxel: snapToAnatomy(
      fracToVoxel(plane, fx, fy, state.cursor, state.volume.meta.dims),
      plane,
      state.volume,
    ),
    label: requireString(msg, 'label'),
    summary: optionalString(msg, 'summary'),
    severity: optionalSeverity(msg),
    confidence: rawConfidence != null ? clamp(Math.round(rawConfidence), 0, 100) : undefined,
    sizeMm: msg.size_mm != null ? Number(msg.size_mm) : undefined,
  };

  state.addAiAnnotation(annotation);
  state.setActiveAnnotation(annotation.id);
  ok({ id: annotation.id });
};

const handleRemoveAnnotation: Handler = ({ msg, ok, fail }) => {
  const removeId = requireString(msg, 'id');
  const state = useVolumeStore.getState();
  if (!state.aiAnnotations.some((a) => a.id === removeId)) {
    fail(`Annotation ${removeId} not found`);
    return;
  }
  state.removeAiAnnotation(removeId);
  ok();
};

const handleListAnnotations: Handler = ({ ok }) => {
  const annotations = useVolumeStore.getState().aiAnnotations.map((a) => ({
    id: a.id,
    plane: a.plane,
    voxel: a.voxel,
    label: a.label,
    summary: a.summary ?? null,
    severity: a.severity,
  }));
  ok({ annotations, count: annotations.length });
};

const handleClearAnnotations: Handler = ({ ok }) => {
  useVolumeStore.getState().clearAiAnnotations();
  ok();
};

const handleSetMeasurement: Handler = ({ msg, ok, fail }) => {
  const state = requireLoaded(fail);
  if (!state) return;
  const dims = state.volume.meta.dims;

  const parsePoint = (key: 'from' | 'to'): MeasurementPoint | null => {
    const point = msg[key] as Partial<MeasurementPoint> | undefined;
    if (!point || typeof point !== 'object') return null;
    const { x, y, z } = point;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return null;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return clampToDims({ x: Math.round(x), y: Math.round(y), z: Math.round(z) }, dims);
  };

  const from = parsePoint('from');
  const to = parsePoint('to');
  if (!from || !to) {
    fail('`from` and `to` must each be {x, y, z} voxel coordinates');
    return;
  }

  // Setting `from` wipes any prior `to`, so the pair always lands atomically.
  state.setMeasurementFrom(from);
  state.setMeasurementTo(to);
  ok({ from, to, distanceMm: useVolumeStore.getState().measurement?.distanceMm ?? null });
};

const handleGetMeasurement: Handler = ({ ok }) => {
  const measurement = useVolumeStore.getState().measurement;
  ok({
    hasMeasurement: measurement !== null,
    from: measurement?.from ?? null,
    to: measurement?.to ?? null,
    distanceMm: measurement?.distanceMm ?? null,
  });
};

const handleClearMeasurement: Handler = ({ ok }) => {
  useVolumeStore.getState().clearMeasurement();
  ok();
};

export const MCP_HANDLERS: Record<string, Handler> = {
  get_state: handleGetState,
  overview: handleOverview,
  navigate: handleNavigate,
  step: handleStep,
  navigate_center: handleNavigateCenter,
  set_wl: handleSetWl,
  apply_wl_preset: handleApplyWlPreset,
  set_preset: handleSetPreset,
  set_slab_mm: handleSetSlabMm,
  capture_slice: handleCaptureSlice,
  capture_3d: handleCapture3d,
  capture_all: handleCaptureAll,
  overview_grid: handleOverviewGrid,
  add_annotation: handleAddAnnotation,
  remove_annotation: handleRemoveAnnotation,
  list_annotations: handleListAnnotations,
  clear_annotations: handleClearAnnotations,
  set_measurement: handleSetMeasurement,
  get_measurement: handleGetMeasurement,
  clear_measurement: handleClearMeasurement,
};
