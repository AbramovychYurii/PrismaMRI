/**
 * MCP action handlers — one function per protocol command.
 *
 * Each handler reads the global volume store, performs its side effect
 * (cursor move, capture, annotation, …), and reports back via `ok` / `fail`.
 *
 * Split out from `useMcpBridge` so each command lives independently and the
 * dispatcher in the bridge stays a thin lookup table.
 */

import { useVolumeStore } from '@/store/volumeStore';
import type { AiAnnotation, AnnotationSeverity, MeasurementPoint, SlicePlane } from '@/types';

import { extractSliceGrayImage } from '@/lib/volume/slices';
import { captureCanvas, renderSliceForMcp, waitForPaint } from './canvas-utils';
import { MCP_JPEG_QUALITY, MCP_MAX_EDGE, SEVERITIES, WL_PRESETS } from './constants';
import {
  clampVoxel,
  halfSlabsFor,
  sliceIndex,
  sliceTotal,
  snapToAnatomy,
  voxelFromFrac,
} from './voxel-utils';

// ── Public types ─────────────────────────────────────────────────────────────

/** Free-form message body — handlers narrow individual fields as needed. */
export type HandlerMessage = Record<string, unknown> & { id: string; action: string };

export interface HandlerContext {
  msg: HandlerMessage;
  ok: (data?: unknown) => void;
  fail: (error: string) => void;
}

export type Handler = (ctx: HandlerContext) => void | Promise<void>;

// ── State ────────────────────────────────────────────────────────────────────

const handleGetState: Handler = ({ ok }) => {
  const { volume, cursor, wl, renderPreset } = useVolumeStore.getState();
  const dims = volume?.meta.dims ?? null;
  const spacing = volume?.meta.spacing ?? null;
  ok({
    volumeLoaded: volume !== null,
    dims,
    spacing,
    cursor,
    sliceIndices:
      cursor && dims
        ? {
            coronal: sliceIndex(cursor, 'coronal'),
            sagittal: sliceIndex(cursor, 'sagittal'),
            axial: sliceIndex(cursor, 'axial'),
          }
        : null,
    sliceTotals: dims
      ? {
          coronal: sliceTotal(dims, 'coronal'),
          sagittal: sliceTotal(dims, 'sagittal'),
          axial: sliceTotal(dims, 'axial'),
        }
      : null,
    wl,
    preset: renderPreset,
  });
};

// ── Overview ─────────────────────────────────────────────────────────────────

const handleOverview: Handler = ({ ok, fail }) => {
  const { volume, wl, setCursor } = useVolumeStore.getState();
  if (!volume) {
    fail('No volume loaded');
    return;
  }

  const { dims, spacing, modality, scanner, protocol } = volume.meta;
  const centre = {
    x: Math.floor(dims[0] / 2),
    y: Math.floor(dims[1] / 2),
    z: Math.floor(dims[2] / 2),
  };
  // Update UI crosshair without waiting for canvas repaint —
  // images are rendered directly from the voxel buffer (background-safe).
  setCursor(centre);
  ok({
    meta: {
      dims,
      spacing,
      modality,
      scanner,
      protocol,
      scalarMin: volume.scalarMin,
      scalarMax: volume.scalarMax,
      formatId: volume.formatId,
    },
    cursor: centre,
    sliceIndices: {
      coronal: centre.y + 1,
      sagittal: centre.x + 1,
      axial: centre.z + 1,
    },
    images: {
      coronal: renderSliceForMcp(extractSliceGrayImage(volume, 'coronal', centre.y, wl, 0)),
      sagittal: renderSliceForMcp(extractSliceGrayImage(volume, 'sagittal', centre.x, wl, 0)),
      axial: renderSliceForMcp(extractSliceGrayImage(volume, 'axial', centre.z, wl, 0)),
    },
  });
};

// ── Navigate ─────────────────────────────────────────────────────────────────

const handleNavigate: Handler = ({ msg, ok, fail }) => {
  const plane = msg.plane as SlicePlane;
  const slice = msg.slice as number;
  const { cursor, volume, setCursor } = useVolumeStore.getState();
  if (!cursor || !volume) {
    fail('No volume loaded');
    return;
  }
  const dims = volume.meta.dims;
  const cur = { ...cursor };
  if (plane === 'coronal') cur.y = clampVoxel(slice - 1, dims[1]);
  if (plane === 'sagittal') cur.x = clampVoxel(slice - 1, dims[0]);
  if (plane === 'axial') cur.z = clampVoxel(slice - 1, dims[2]);
  setCursor(cur);
  ok();
};

const handleStep: Handler = ({ msg, ok, fail }) => {
  const plane = msg.plane as SlicePlane;
  const steps = msg.steps as number;
  const { cursor, volume, setCursor } = useVolumeStore.getState();
  if (!cursor || !volume) {
    fail('No volume loaded');
    return;
  }
  const dims = volume.meta.dims;
  const total = sliceTotal(dims, plane);
  const cur = { ...cursor };
  if (plane === 'coronal') cur.y = clampVoxel(cursor.y + steps, dims[1]);
  if (plane === 'sagittal') cur.x = clampVoxel(cursor.x + steps, dims[0]);
  if (plane === 'axial') cur.z = clampVoxel(cursor.z + steps, dims[2]);
  setCursor(cur);
  ok({ slice: sliceIndex(cur, plane), total });
};

const handleNavigateCenter: Handler = ({ ok, fail }) => {
  const { volume, setCursor } = useVolumeStore.getState();
  if (!volume) {
    fail('No volume loaded');
    return;
  }
  const { dims } = volume.meta;
  const centre = {
    x: Math.floor(dims[0] / 2),
    y: Math.floor(dims[1] / 2),
    z: Math.floor(dims[2] / 2),
  };
  setCursor(centre);
  ok({
    sliceIndices: {
      coronal: centre.y + 1,
      sagittal: centre.x + 1,
      axial: centre.z + 1,
    },
  });
};

// ── Window / level ───────────────────────────────────────────────────────────

const handleSetWl: Handler = ({ msg, ok }) => {
  const wl = { window: msg.window as number, level: msg.level as number };
  const state = useVolumeStore.getState();
  state.setWL(wl);
  state.setWLDraft(wl);
  ok();
};

const handleApplyWlPreset: Handler = ({ msg, ok, fail }) => {
  const preset = msg.preset as string;
  const { volume, setWL, setWLDraft } = useVolumeStore.getState();
  if (!volume) {
    fail('No volume loaded');
    return;
  }
  const fracs = WL_PRESETS[preset] ?? WL_PRESETS.full_range;
  const range = volume.scalarMax - volume.scalarMin;
  const wl = {
    window: range * fracs[0],
    level: volume.scalarMin + range * fracs[1],
  };
  setWL(wl);
  setWLDraft(wl);
  ok(wl);
};

const handleSetPreset: Handler = ({ msg, ok, fail }) => {
  const preset = msg.preset as string;
  if (preset === 'tissue') {
    fail(
      '"tissue" preset is not available via MCP — ' +
        'it requires full per-voxel compositing which exceeds the capture time budget. ' +
        'Use "bone" for skeletal/dental CT or "mip" for overview.',
    );
    return;
  }
  useVolumeStore.getState().setRenderPreset(preset as 'mip' | 'bone');
  ok();
};

const handleSetSlabMm: Handler = ({ msg, ok, fail }) => {
  const raw = Number(msg.slab_mm);
  if (!Number.isFinite(raw) || raw < 0) {
    fail('slab_mm must be a non-negative number');
    return;
  }
  const slabMm = Math.min(50, raw);
  useVolumeStore.getState().setSlabMm(slabMm);
  ok({ slabMm });
};

// ── Capture ──────────────────────────────────────────────────────────────────

const handleCaptureSlice: Handler = async ({ msg, ok, fail }) => {
  const plane = msg.plane as SlicePlane;
  const slabMm = (msg.slab_mm as number | undefined) ?? 0;

  // With a slab thickness, render a native-resolution slab-MIP image
  // straight from the voxel buffer (sharper than a canvas grab, and
  // independent of the panel's current slab setting).
  if (slabMm > 0) {
    const { volume, cursor, wl } = useVolumeStore.getState();
    if (!volume || !cursor) {
      fail('No volume loaded');
      return;
    }
    const index = plane === 'coronal' ? cursor.y : plane === 'sagittal' ? cursor.x : cursor.z;
    const half = halfSlabsFor(plane, slabMm, volume.meta.spacing);
    const image = extractSliceGrayImage(volume, plane, index, wl, half);
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
  const { volume, cursor, wl } = useVolumeStore.getState();
  if (!volume || !cursor) {
    fail('No volume loaded');
    return;
  }
  ok({
    coronal: renderSliceForMcp(extractSliceGrayImage(volume, 'coronal', cursor.y, wl, 0)),
    sagittal: renderSliceForMcp(extractSliceGrayImage(volume, 'sagittal', cursor.x, wl, 0)),
    axial: renderSliceForMcp(extractSliceGrayImage(volume, 'axial', cursor.z, wl, 0)),
  });
};

const handleOverviewGrid: Handler = ({ msg, ok, fail }) => {
  const plane = msg.plane as SlicePlane;
  const count = Math.min(4, Math.max(2, (msg.count as number) ?? 4));
  const { volume, wl } = useVolumeStore.getState();
  if (!volume) {
    fail('No volume loaded');
    return;
  }

  const dims = volume.meta.dims;
  const total = sliceTotal(dims, plane);
  // Default 3 mm slab for overview grid — improves lesion visibility
  // without obscuring fine margins.
  const half = halfSlabsFor(plane, 3, volume.meta.spacing);

  // Build evenly-spaced 1-based indices.
  const indices = Array.from({ length: count }, (_, i) =>
    Math.round(1 + (i / (count - 1)) * (total - 1)),
  );

  const images = indices.map((slice) => {
    const idx = slice - 1; // 0-based
    return renderSliceForMcp(extractSliceGrayImage(volume, plane, idx, wl, half));
  });

  ok({ images, indices, total });
};

// ── Annotations ──────────────────────────────────────────────────────────────

const handleAddAnnotation: Handler = ({ msg, ok, fail }) => {
  const state = useVolumeStore.getState();
  const { cursor, volume } = state;
  if (!cursor || !volume) {
    fail('No volume loaded');
    return;
  }
  const plane = msg.plane as SlicePlane;
  const fx = msg.fx as number;
  const fy = msg.fy as number;
  const severity = SEVERITIES.includes(msg.severity as AnnotationSeverity)
    ? (msg.severity as AnnotationSeverity)
    : 'serious';
  const rawVoxel = voxelFromFrac(plane, fx, fy, cursor, volume.meta.dims);
  const snappedVoxel = snapToAnatomy(rawVoxel, plane, volume);
  const rawConfidence = msg.confidence as number | undefined;
  const annotation: Omit<AiAnnotation, 'volumeId'> = {
    id: crypto.randomUUID(),
    plane,
    fx,
    fy,
    voxel: snappedVoxel,
    label: msg.label as string,
    summary: msg.summary as string | undefined,
    severity,
    confidence:
      rawConfidence != null ? Math.min(100, Math.max(0, Math.round(rawConfidence))) : undefined,
    sizeMm: msg.size_mm != null ? Number(msg.size_mm) : undefined,
  };
  state.addAiAnnotation(annotation);
  // Focus the new finding so it's immediately visible to the user.
  state.setActiveAnnotation(annotation.id);
  ok({ id: annotation.id });
};

const handleRemoveAnnotation: Handler = ({ msg, ok, fail }) => {
  const removeId = msg.id as string;
  const state = useVolumeStore.getState();
  if (!state.aiAnnotations.some((a) => a.id === removeId)) {
    fail(`Annotation ${removeId} not found`);
    return;
  }
  state.removeAiAnnotation(removeId);
  ok();
};

const handleListAnnotations: Handler = ({ ok }) => {
  const list = useVolumeStore.getState().aiAnnotations.map((a) => ({
    id: a.id,
    plane: a.plane,
    voxel: a.voxel,
    label: a.label,
    summary: a.summary ?? null,
    severity: a.severity,
  }));
  ok({ annotations: list, count: list.length });
};

const handleClearAnnotations: Handler = ({ ok }) => {
  useVolumeStore.getState().clearAiAnnotations();
  ok();
};

// ── Measurements ─────────────────────────────────────────────────────────────

const handleSetMeasurement: Handler = ({ msg, ok, fail }) => {
  const state = useVolumeStore.getState();
  const { volume } = state;
  if (!volume) {
    fail('No volume loaded');
    return;
  }
  const dims = volume.meta.dims;
  const parsePoint = (key: 'from' | 'to'): MeasurementPoint | null => {
    const p = msg[key] as Partial<MeasurementPoint> | undefined;
    if (!p || typeof p !== 'object') return null;
    const { x, y, z } = p;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return {
      x: clampVoxel(Math.round(x as number), dims[0]),
      y: clampVoxel(Math.round(y as number), dims[1]),
      z: clampVoxel(Math.round(z as number), dims[2]),
    };
  };
  const from = parsePoint('from');
  const to = parsePoint('to');
  if (!from || !to) {
    fail('`from` and `to` must each be {x, y, z} voxel coordinates');
    return;
  }
  // Replace any existing measurement atomically — placing `from`
  // wipes the prior `to`, then we set `to` to finalize distance.
  state.setMeasurementFrom(from);
  state.setMeasurementTo(to);
  const m = useVolumeStore.getState().measurement;
  ok({
    from,
    to,
    distanceMm: m?.distanceMm ?? null,
  });
};

const handleGetMeasurement: Handler = ({ ok }) => {
  const m = useVolumeStore.getState().measurement;
  ok({
    hasMeasurement: m !== null,
    from: m?.from ?? null,
    to: m?.to ?? null,
    distanceMm: m?.distanceMm ?? null,
  });
};

const handleClearMeasurement: Handler = ({ ok }) => {
  useVolumeStore.getState().clearMeasurement();
  ok();
};

// ── Handler registry ─────────────────────────────────────────────────────────

/**
 * Action name → handler function. The bridge dispatcher looks up by name and
 * falls back to a "Unknown action" error when no entry matches.
 */
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
