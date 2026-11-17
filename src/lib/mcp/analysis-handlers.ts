import {
  type LoadedVolume,
  PLANE_GEOMETRY,
  type Vec3,
  type VolumeCursor,
  clampToDims,
  extractSliceGrayImage,
  planeAspect,
  slabHalfSlices,
  sliceCount,
  sliceIndex,
} from '@prisma-mri/viewer-core';
import {
  type ComponentObject,
  type Labelling,
  autoClasses,
  axisProfile,
  checkArrangement,
  checkSymmetry,
  describeObject,
  findGaps,
  labelComponents,
  lineProfile,
  roiStats,
  roundLineProfile,
  roundRoi,
  sliceCurve,
  splitTouching,
  surveySubject,
  thresholdMask,
} from '@prisma-mri/viewer-core/analysis';
import { alongAxis, clamp, round } from '@prisma-mri/viewer-core/unstable';
import { cropSliceForMcp, montageForMcp } from './canvas-utils';
import { MAX_SLAB_MM, MCP_ANALYSIS_MAX_EDGE } from './constants';
import { type Handler, evenlySpaced, requireLoaded } from './handler-base';
import {
  optionalBoolean,
  optionalNumber,
  optionalOneOf,
  optionalRegion,
  optionalVoxel,
  requireNumber,
  requireOneOf,
  requirePlane,
  requireVoxel,
} from './validate';

/**
 * Commands that look at the voxels themselves. They answer in a few lines of
 * numbers — what the agent needs to decide where to look, or what a size
 * really is — and leave the pictures to the capture commands.
 */

const AXES = ['x', 'y', 'z'] as const;

/** The voxel nearest to a position that may be fractional or outside the volume. */
function nearestVoxel([x, y, z]: Vec3, dims: Vec3): VolumeCursor {
  return clampToDims({ x: Math.round(x), y: Math.round(y), z: Math.round(z) }, dims);
}

const handleSurvey: Handler = ({ ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  ok(surveySubject(state.volume));
};

const handleRoiStats: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  const { volume } = state;
  const shape =
    msg.min !== undefined
      ? { kind: 'box' as const, min: requireVoxel(msg, 'min'), max: requireVoxel(msg, 'max') }
      : {
          kind: 'sphere' as const,
          center: optionalVoxel(msg, 'center') ?? [state.cursor.x, state.cursor.y, state.cursor.z],
          radiusMm: clamp(optionalNumber(msg, 'radius_mm', 5), 0.5, 60),
        };
  const stats = roiStats(volume, shape);
  if (stats.voxels === 0) {
    fail('The region contains no voxels');
    return;
  }
  ok({
    shape,
    ...roundRoi(stats),
    note:
      volume.meta.modality === 'MR'
        ? 'MR intensities are arbitrary units: compare regions of the same scan, do not read absolute values.'
        : undefined,
  });
};

const handleLineProfile: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  const profile = lineProfile(
    state.volume,
    requireVoxel(msg, 'from'),
    requireVoxel(msg, 'to'),
    optionalNumber(msg, 'samples', 64),
  );
  ok(roundLineProfile(profile));
};

const handleSliceCurve: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  const axis = requireOneOf(msg, 'axis', AXES);
  const metric = requireOneOf(msg, 'metric', ['mean', 'area_above', 'max'] as const);
  ok(
    sliceCurve(state.volume, axis, metric, {
      threshold: optionalNumber(msg, 'threshold'),
      maxPoints: optionalNumber(msg, 'max_points', 120),
    }),
  );
};

/** The labelling of the last `find_objects`, so `axis_profile` and `check_arrangement` can refer to ids. */
const lastObjects = new WeakMap<LoadedVolume, Labelling>();

const handleFindObjects: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  const { volume } = state;
  const level = optionalOneOf(msg, 'level', ['subject', 'dense'] as const) ?? 'dense';
  const [tissue, dense] = autoClasses(volume);
  const lo = optionalNumber(msg, 'threshold') ?? (level === 'subject' ? tissue : dense);
  const hi = optionalNumber(msg, 'threshold_max');
  const mask = thresholdMask(volume, { lo, hi, region: optionalRegion(msg, 'region') });
  const voxelMm3 = mask.spacing[0] * mask.spacing[1] * mask.spacing[2];
  const minVolume = optionalNumber(msg, 'min_volume_mm3', 5);
  const options = { minVoxels: Math.max(1, Math.ceil(minVolume / voxelMm3)), maxObjects: 400 };
  const split = optionalBoolean(msg, 'split_touching', false);
  const labelling = split ? splitTouching(mask, options) : labelComponents(mask, options);
  lastObjects.set(volume, labelling);
  const limit = clamp(Math.round(optionalNumber(msg, 'max_objects', 25)), 1, 60);
  ok({
    threshold: round(lo, 1),
    thresholdMax: hi,
    resolutionVoxels: mask.stride,
    split,
    found: labelling.objects.length,
    shown: Math.min(limit, labelling.objects.length),
    objects: labelling.objects.slice(0, limit).map(describeObject),
  });
};

const handleAxisProfile: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  const labelling = lastObjects.get(state.volume);
  if (!labelling) {
    fail('No objects yet — run find_objects first, then pass one of its ids.');
    return;
  }
  const id = requireNumber(msg, 'object_id');
  const profile = axisProfile(labelling, id, optionalNumber(msg, 'segments', 24));
  if (!profile) {
    fail(`Object ${id} is not in the last find_objects result, or is too small to follow.`);
    return;
  }
  const { path, ...rest } = profile;
  ok({ ...rest, path: path.filter((_, i) => i % Math.ceil(path.length / 8) === 0) });
};

/**
 * The objects likely to form one row when the agent names none: those of a
 * size close to the typical one, with specks and the bone around them left out.
 */
function pickRow(objects: ComponentObject[]): ComponentObject[] {
  const largest = objects[0]?.volumeMm3 ?? 0;
  const sizable = objects.filter((o) => o.volumeMm3 >= 0.01 * largest);
  const sorted = sizable.map((o) => o.volumeMm3).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1] ?? 0;
  return sizable.filter((o) => o.volumeMm3 >= median / 6 && o.volumeMm3 <= median * 6);
}

const handleCheckArrangement: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  const labelling = lastObjects.get(state.volume);
  if (!labelling) {
    fail('No objects yet — run find_objects first (split_touching: true if they touch).');
    return;
  }
  const ids = Array.isArray(msg.object_ids)
    ? (msg.object_ids as unknown[]).filter((n): n is number => typeof n === 'number')
    : null;
  const objects = ids
    ? labelling.objects.filter((o) => ids.includes(o.id))
    : pickRow(labelling.objects);
  const report = checkArrangement(objects, {
    plane: msg.plane == null ? 'axial' : requirePlane(msg),
    minOffsetMm: optionalNumber(msg, 'min_offset_mm', 3),
    minTiltExcessDeg: optionalNumber(msg, 'min_tilt_excess_deg', 20),
  });
  if (!report) {
    fail(
      `Only ${objects.length} objects in the row — at least 5 are needed to tell what is regular.`,
    );
    return;
  }
  ok({ ...report, items: report.items.slice(0, 40) });
};

const handleCheckSymmetry: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  ok(
    checkSymmetry(state.volume, {
      axis: optionalOneOf(msg, 'axis', AXES),
      region: optionalRegion(msg, 'region'),
    }),
  );
};

const handleFindGaps: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  ok(
    findGaps(state.volume, {
      threshold: optionalNumber(msg, 'threshold'),
      maxGapMm: clamp(optionalNumber(msg, 'max_gap_mm', 2), 0.3, 8),
      minAreaMm2: optionalNumber(msg, 'min_area_mm2', 15),
      region: optionalRegion(msg, 'region'),
      // Full resolution matters here: a 0.25 mm crack vanishes at stride 2.
      maxVoxels: clamp(optionalNumber(msg, 'max_voxels', 40_000_000), 1_000_000, 64_000_000),
    }),
  );
};

const handleNavigateToVoxel: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  const cursor = nearestVoxel(requireVoxel(msg, 'voxel'), state.volume.meta.dims);
  viewer.setCursor(cursor);
  ok({ cursor });
};

const handleCaptureRegion: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  const { volume, windowLevel, cursor } = state;
  const { dims, spacing } = volume.meta;
  const plane = requirePlane(msg);
  const center = nearestVoxel(optionalVoxel(msg, 'center') ?? [cursor.x, cursor.y, cursor.z], dims);
  const fov = clamp(optionalNumber(msg, 'fov_mm', 40), 5, 400);
  const size = clamp(Math.round(optionalNumber(msg, 'size', 640)), 128, MCP_ANALYSIS_MAX_EDGE);
  const slab = clamp(optionalNumber(msg, 'slab_mm', 0), 0, MAX_SLAB_MM);

  // The crop, in pixels of the slice image the plane is drawn as.
  const { horizontal, vertical, verticalFlipped } = PLANE_GEOMETRY[plane];
  const imageW = alongAxis(dims, horizontal);
  const imageH = alongAxis(dims, vertical);
  const mmPerCol = alongAxis(spacing, horizontal);
  const mmPerRow = alongAxis(spacing, vertical);
  const col = center[horizontal];
  const row = verticalFlipped ? imageH - 1 - center[vertical] : center[vertical];
  const halfW = fov / 2 / mmPerCol;
  const halfH = fov / 2 / mmPerRow;
  const x0 = Math.max(0, Math.floor(col - halfW));
  const x1 = Math.min(imageW, Math.ceil(col + halfW + 1));
  const y0 = Math.max(0, Math.floor(row - halfH));
  const y1 = Math.min(imageH, Math.ceil(row + halfH + 1));
  const widthMm = (x1 - x0) * mmPerCol;
  const heightMm = (y1 - y0) * mmPerRow;
  const scale = size / Math.max(widthMm, heightMm);

  const slice = sliceIndex(center, plane);
  const image = extractSliceGrayImage(
    volume,
    plane,
    slice,
    windowLevel,
    slabHalfSlices(plane, slab, spacing),
  );
  ok({
    imageData: cropSliceForMcp(
      image,
      { x0, y0, x1, y1 },
      Math.max(1, Math.round(widthMm * scale)),
      Math.max(1, Math.round(heightMm * scale)),
    ),
    plane,
    sliceNumber: slice + 1,
    centerVoxel: center,
    fovMm: [round(widthMm, 1), round(heightMm, 1)],
    mmPerPixel: round(1 / scale, 3),
    nativeMmPerVoxel: [mmPerCol, mmPerRow],
    windowLevel,
  });
};

const handleCaptureMontage: Handler = ({ msg, ok, fail, viewer }) => {
  const state = requireLoaded(viewer, fail);
  if (!state) return;
  const { volume, windowLevel } = state;
  const { dims, spacing } = volume.meta;
  const plane = requirePlane(msg);
  const total = sliceCount(dims, plane);
  const count = clamp(Math.round(optionalNumber(msg, 'count', 12)), 2, 20);
  const first = clamp(Math.round(optionalNumber(msg, 'from_slice', 1)), 1, total);
  const last = clamp(Math.round(optionalNumber(msg, 'to_slice', total)), first, total);
  const slab = clamp(optionalNumber(msg, 'slab_mm', 3), 0, MAX_SLAB_MM);
  const sheetEdge = clamp(
    Math.round(optionalNumber(msg, 'size', 1200)),
    400,
    MCP_ANALYSIS_MAX_EDGE,
  );

  const half = slabHalfSlices(plane, slab, spacing);
  const slices = evenlySpaced(first, last, count);
  const columns = Math.ceil(Math.sqrt(count * 1.25));
  const aspect = planeAspect(plane, dims, spacing);
  const tileW = Math.floor(aspect >= 1 ? sheetEdge / columns : (sheetEdge / columns) * aspect);
  const tileH = Math.floor(aspect >= 1 ? tileW / aspect : sheetEdge / columns);
  const tiles = slices.map((n) => ({
    image: extractSliceGrayImage(volume, plane, n - 1, windowLevel, half),
    label: `${plane} ${n}/${total}`,
  }));
  ok({
    imageData: montageForMcp(tiles, columns, tileW, tileH),
    plane,
    slices,
    total,
    columns,
    slabMm: slab,
    windowLevel,
  });
};

export const ANALYSIS_HANDLERS: Record<string, Handler> = {
  survey_subject: handleSurvey,
  roi_stats: handleRoiStats,
  line_profile: handleLineProfile,
  slice_curve: handleSliceCurve,
  find_objects: handleFindObjects,
  axis_profile: handleAxisProfile,
  check_arrangement: handleCheckArrangement,
  check_symmetry: handleCheckSymmetry,
  find_gaps: handleFindGaps,
  navigate_to_voxel: handleNavigateToVoxel,
  capture_region: handleCaptureRegion,
  capture_montage: handleCaptureMontage,
};
