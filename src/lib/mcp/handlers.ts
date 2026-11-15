import {
  type Annotation,
  type MeasurementPoint,
  type SlicePlane,
  type VolumeCursor,
  clampToDims,
  extractSliceGrayImage,
  fracToVoxel,
  slabHalfSlices,
  sliceAxis,
  sliceCount,
  sliceIndex,
  sliceNumber,
  volumeCenter,
} from '@prisma-mri/viewer-core';
import { clamp, seriesLabel } from '@prisma-mri/viewer-core/unstable';

import { ANALYSIS_HANDLERS } from './analysis-handlers';
import { captureCanvas, renderSliceForMcp, waitForPaint } from './canvas-utils';
import { MAX_SLAB_MM, MCP_JPEG_QUALITY, MCP_MAX_EDGE, WL_PRESETS } from './constants';
import { type Handler, type LoadedState, evenlySpaced, requireLoaded } from './handler-base';
import { SERIES_HANDLERS } from './series-handlers';
import {
  optionalNumber,
  optionalOneOf,
  optionalSeverity,
  optionalString,
  requireFraction,
  requireNumber,
  requireOneOf,
  requirePlane,
  requireString,
} from './validate';
import { snapToAnatomy } from './voxel-utils';

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
      extractSliceGrayImage(state.volume, plane, sliceIndex(cursor, plane), state.windowLevel, 0),
    );
  return { coronal: render('coronal'), sagittal: render('sagittal'), axial: render('axial') };
}

const handleGetState: Handler = ({ ok, viewer }) => {
  const {
    volume,
    cursor,
    windowLevel: wl,
    renderPreset,
    seriesList,
    activeSeriesKey,
  } = viewer.getSnapshot();
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
    series: seriesList
      ? {
          count: seriesList.length,
          active: seriesLabel(seriesList, activeSeriesKey) ?? null,
        }
      : null,
  });
};

const handleOverview: Handler = ({ ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;

  const { dims, spacing, modality, scanner, protocol } = state.volume.meta;
  const center = volumeCenter(dims);
  viewer.setCursor(center);

  ok({
    meta: {
      dims,
      spacing,
      modality,
      scanner,
      protocol,
      bodyPart: state.volume.meta.bodyPart,
      species: state.volume.meta.species,
      studyDescription: state.volume.meta.studyDescription,
      scalarMin: state.volume.scalarMin,
      scalarMax: state.volume.scalarMax,
      formatId: state.volume.formatId,
    },
    cursor: center,
    sliceIndices: sliceNumbers(center),
    images: sliceImagesAt(state, center),
  });
};

const handleNavigate: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  const plane = requirePlane(msg);
  const slice = requireNumber(msg, 'slice');
  const dims = state.volume.meta.dims;
  viewer.setCursor(clampToDims({ ...state.cursor, [sliceAxis(plane)]: slice - 1 }, dims));
  ok();
};

const handleStep: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  const plane = requirePlane(msg);
  const steps = requireNumber(msg, 'steps');
  const dims = state.volume.meta.dims;
  const next = clampToDims(
    { ...state.cursor, [sliceAxis(plane)]: sliceIndex(state.cursor, plane) + steps },
    dims,
  );
  viewer.setCursor(next);
  ok({ slice: sliceNumber(next, plane), total: sliceCount(dims, plane) });
};

const handleNavigateCenter: Handler = ({ ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  const center = volumeCenter(state.volume.meta.dims);
  viewer.setCursor(center);
  ok({ sliceIndices: sliceNumbers(center) });
};

const handleSetWl: Handler = ({ msg, ok, viewer }) => {
  const wl = { window: requireNumber(msg, 'window'), level: requireNumber(msg, 'level') };
  viewer.setWindowLevel(wl);
  ok();
};

const handleApplyWlPreset: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  // Named rather than defaulted: silently applying full_range for a typo left
  // the agent reasoning about contrast it never asked for.
  const preset = requireOneOf(msg, 'preset', Object.keys(WL_PRESETS));
  const [windowFrac, levelFrac] = WL_PRESETS[preset];
  const range = state.volume.scalarMax - state.volume.scalarMin;
  const wl = { window: range * windowFrac, level: state.volume.scalarMin + range * levelFrac };
  viewer.setWindowLevel(wl);
  ok(wl);
};

const handleSetPreset: Handler = ({ msg, ok, fail, viewer }) => {
  if (msg.preset === 'tissue') {
    fail(
      '"tissue" preset is not available via MCP — ' +
        'it requires full per-voxel compositing which exceeds the capture time budget. ' +
        'Use "bone" for skeletal/dental CT or "mip" for overview.',
    );
    return;
  }
  viewer.setRenderPreset(requireOneOf(msg, 'preset', ['mip', 'bone'] as const));
  ok();
};

const handleSetSlabMm: Handler = ({ msg, ok, fail, viewer }) => {
  const requested = Number(msg.slab_mm);
  if (!Number.isFinite(requested) || requested < 0) {
    fail('slab_mm must be a non-negative number');
    return;
  }
  const slabMm = Math.min(MAX_SLAB_MM, requested);
  viewer.setSlabMm(slabMm);
  ok({ slabMm });
};

const handleCaptureSlice: Handler = async ({ msg, ok, fail, viewer }) => {
  const plane = requirePlane(msg);
  const slabMm = optionalNumber(msg, 'slab_mm', 0);

  // A slab renders straight from the voxel buffer: sharper than a canvas grab
  // and independent of the panel's own slab setting.
  if (slabMm > 0) {
    const state = requireLoaded(viewer, fail);
    if (!state) return;
    const { volume, cursor, windowLevel: wl } = state;
    const half = slabHalfSlices(plane, slabMm, volume.meta.spacing);
    const image = extractSliceGrayImage(volume, plane, sliceIndex(cursor, plane), wl, half);
    ok({ imageData: renderSliceForMcp(image), slabMm });
    return;
  }

  const canvas = viewer.surfaces.canvas(plane);
  if (!canvas) {
    fail(`Canvas for ${plane} not available`);
    return;
  }
  await waitForPaint();
  ok({ imageData: captureCanvas(canvas) });
};

const CAPTURE_3D_VIEWS = ['current', 'coronal', 'sagittal', 'axial', 'all'] as const;

const handleCapture3d: Handler = async ({ msg, ok, fail, viewer }) => {
  const view = optionalOneOf(msg, 'view', CAPTURE_3D_VIEWS) ?? 'current';
  const preview = viewer.surfaces.preview();
  if (!preview) {
    fail('3-D view not ready');
    return;
  }
  await waitForPaint();

  if (view === 'current') {
    ok({ imageData: preview.captureJpeg(MCP_MAX_EDGE, MCP_JPEG_QUALITY) });
    return;
  }
  const from = (plane: SlicePlane) =>
    preview.captureJpegFromPlane(plane, MCP_MAX_EDGE, MCP_JPEG_QUALITY);
  if (view === 'all') {
    ok({ coronal: from('coronal'), sagittal: from('sagittal'), axial: from('axial') });
    return;
  }
  ok({ imageData: from(view), view });
};

const handleCaptureAll: Handler = ({ ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  ok(sliceImagesAt(state, state.cursor));
};

/** Slab thickness for the overview grid — improves lesion visibility without hiding margins. */
const OVERVIEW_GRID_SLAB_MM = 3;

const handleOverviewGrid: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  const plane = requirePlane(msg);
  // The range the MCP tool advertises (and the radiology skill asks for, 6).
  const count = clamp(optionalNumber(msg, 'count', 5), 2, 8);
  const { volume, windowLevel: wl } = state;
  const total = sliceCount(volume.meta.dims, plane);
  const half = slabHalfSlices(plane, OVERVIEW_GRID_SLAB_MM, volume.meta.spacing);

  const indices = evenlySpaced(1, total, count);
  const images = indices.map((slice) =>
    renderSliceForMcp(extractSliceGrayImage(volume, plane, slice - 1, wl, half)),
  );

  ok({ images, indices, total });
};

const handleAddAnnotation: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;

  const plane = requirePlane(msg);
  const fx = requireFraction(msg, 'fx');
  const fy = requireFraction(msg, 'fy');
  const rawConfidence = msg.confidence == null ? undefined : requireNumber(msg, 'confidence');

  const annotation: Omit<Annotation, 'volumeId'> = {
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

  viewer.addAnnotation(annotation);
  viewer.setActiveAnnotation(annotation.id);
  ok({ id: annotation.id });
};

const handleRemoveAnnotation: Handler = ({ msg, ok, fail, viewer }) => {
  const removeId = requireString(msg, 'id');
  const state = viewer.getSnapshot();
  const elsewhere = state.otherSeriesAnnotations.find((a) => a.id === removeId);
  if (elsewhere) {
    const series = seriesLabel(state.seriesList, elsewhere.seriesKey) ?? elsewhere.seriesKey;
    fail(
      `Annotation ${removeId} is on series "${series}", which is not on screen: switch_series to it first.`,
    );
    return;
  }
  if (!state.annotations.some((a) => a.id === removeId)) {
    fail(`Annotation ${removeId} not found`);
    return;
  }
  viewer.removeAnnotation(removeId);
  ok();
};

const handleListAnnotations: Handler = ({ ok, viewer }) => {
  const { annotations: onScreen, otherSeriesAnnotations, seriesList } = viewer.getSnapshot();
  // `voxel` is always in the coordinates of the finding's own series.
  const annotations = [...onScreen, ...otherSeriesAnnotations].map((a) => ({
    id: a.id,
    plane: a.plane,
    voxel: a.voxel,
    label: a.label,
    summary: a.summary ?? null,
    severity: a.severity,
    series: seriesLabel(seriesList, a.seriesKey) ?? null,
    onScreen: onScreen.includes(a),
  }));
  ok({ annotations, count: annotations.length });
};

const handleClearAnnotations: Handler = ({ ok, viewer }) => {
  viewer.clearAnnotations();
  ok();
};

const handleSetMeasurement: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
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

  viewer.setMeasurement(from, to);
  ok({ from, to, distanceMm: viewer.getSnapshot().measurement?.distanceMm ?? null });
};

const handleGetMeasurement: Handler = ({ ok, viewer }) => {
  const measurement = viewer.getSnapshot().measurement;
  ok({
    hasMeasurement: measurement !== null,
    from: measurement?.from ?? null,
    to: measurement?.to ?? null,
    distanceMm: measurement?.distanceMm ?? null,
  });
};

const handleClearMeasurement: Handler = ({ ok, viewer }) => {
  viewer.clearMeasurement();
  ok();
};

export const MCP_HANDLERS: Record<string, Handler> = {
  ...ANALYSIS_HANDLERS,
  ...SERIES_HANDLERS,
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
