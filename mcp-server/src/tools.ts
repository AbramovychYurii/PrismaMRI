/**
 * The tools the MCP server offers, and how each one reaches the app.
 *
 * Pure data — no imports, no side effects — so the app's tests can read it too
 * (src/lib/mcp/tools-contract.test.ts checks it against the app's handlers).
 *
 *   TOOLS         what Claude sees: name, description, input schema.
 *   TOOL_ACTIONS  what goes over the socket: the app's action name for each tool
 *                 and how long to wait for the reply.
 *
 * Adding a tool: an entry in both tables here, a handler in src/lib/mcp (under the
 * action name) with a label in ACTION_LABELS, and a case in handleTool (index.ts)
 * that turns the reply into text. The contract test fails until all four agree.
 */

/** Structurally the SDK's `Tool`; declared here so this file needs no dependency. */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

const PLANES = { type: 'string', enum: ['coronal', 'sagittal', 'axial'] } as const;
const VOXEL = {
  type: 'object',
  description: 'A voxel position (zero-based x, y, z).',
  properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
  required: ['x', 'y', 'z'],
} as const;
const voxelBox = (description: string) =>
  ({
    type: 'object',
    description,
    properties: { min: VOXEL, max: VOXEL },
    required: ['min', 'max'],
  }) as const;

export const TOOLS: ToolDef[] = [
  // ── Overview / state ───────────────────────────────────────────────────────
  {
    name: 'get_viewer_state',
    description: 'Return the current viewer state: volume dims, voxel spacing, crosshair ' +
      'position, slice indices/totals for every plane, window/level and 3-D render preset. ' +
      'When the study has several series it also says how many and which one is open.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_volume_overview',
    description:
      'Get a full picture of the loaded MRI in one call: volume metadata (dimensions, ' +
      'spacing, modality, scalar range, format) PLUS PNG captures of the centre slice on ' +
      'all three anatomical planes.  Call this first when a volume is loaded.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },

  // ── Series ─────────────────────────────────────────────────────────────────
  {
    name: 'list_series',
    description:
      'List the series of the open study (a DICOM folder often holds several: T1, T2, FLAIR, ' +
      'axial, sagittal, a localizer …) with position, label, orientation, slice count, which ' +
      'one is open and how many findings each has. Empty for a single-series volume. Call it ' +
      'early on a MRI study: the lesion may be best seen on a series that is not open.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'switch_series',
    description:
      'Open another series of the study. Everything after it (captures, measurements, ' +
      'analysis, annotations) applies to that series; the crosshair, window/level and 3-D ' +
      'preset go back to its defaults. Findings stay with the series they were placed on. ' +
      'It re-assembles the series from the loaded files, so it can take several seconds.',
    inputSchema: {
      type: 'object',
      properties: {
        series: {
          description:
            'Position in list_series (1 = first), or the series label, or its key.',
          anyOf: [{ type: 'number' }, { type: 'string' }],
        },
      },
      required: ['series'],
    },
  },

  // ── Navigation ─────────────────────────────────────────────────────────────
  {
    name: 'navigate_to_slice',
    description: 'Move the crosshair to an absolute slice index (1-based) on one plane.',
    inputSchema: {
      type: 'object',
      properties: {
        plane: PLANES,
        slice: { type: 'number', description: 'Target slice index (1 … total).' },
      },
      required: ['plane', 'slice'],
    },
  },
  {
    name: 'step_slice',
    description: 'Move the crosshair forward or backward by a relative number of slices ' +
      'on one plane.  Positive steps → deeper; negative → shallower.',
    inputSchema: {
      type: 'object',
      properties: {
        plane: PLANES,
        steps: { type: 'number', description: 'Number of slices to step (positive or negative).' },
      },
      required: ['plane', 'steps'],
    },
  },
  {
    name: 'navigate_to_center',
    description: 'Jump the crosshair to the anatomical centre of the volume (dims / 2).',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },

  // ── Display ────────────────────────────────────────────────────────────────
  {
    name: 'set_window_level',
    description: 'Set window/level (contrast/brightness) to exact numeric values.',
    inputSchema: {
      type: 'object',
      properties: {
        window: { type: 'number', description: 'Window width.' },
        level:  { type: 'number', description: 'Window centre.' },
      },
      required: ['window', 'level'],
    },
  },
  {
    name: 'apply_wl_preset',
    description:
      'Apply a named window/level preset suited to a common MRI sequence or tissue. ' +
      'Presets are computed as fractions of the volume\'s scalar range so they adapt ' +
      'automatically to any scanner.\n' +
      '  full_range   – shows everything, no clipping\n' +
      '  t1           – T1-weighted: medium brightness, good for anatomy\n' +
      '  t2           – T2-weighted: brighter fluid, suppressed fat\n' +
      '  flair        – FLAIR: similar to T2, slightly higher contrast\n' +
      '  soft_tissue  – moderate contrast, mid-range brightness\n' +
      '  bone         – high brightness, wide window for cortical bone\n' +
      '  high_contrast – narrow window for maximum lesion conspicuity',
    inputSchema: {
      type: 'object',
      properties: {
        preset: {
          type: 'string',
          enum: ['full_range', 't1', 't2', 'flair', 'soft_tissue', 'bone', 'high_contrast'],
        },
      },
      required: ['preset'],
    },
  },
  {
    name: 'set_render_preset',
    description: 'Switch the 3-D volume rendering mode (mip / tissue / bone).',
    inputSchema: {
      type: 'object',
      properties: {
        preset: { type: 'string', enum: ['mip', 'tissue', 'bone'] },
      },
      required: ['preset'],
    },
  },
  {
    name: 'set_slab_mm',
    description:
      'Set the Slab MIP thickness (in millimetres) applied to ALL three 2-D ' +
      'slice panels. A slab MIP composites several adjacent slices into one, ' +
      'so vessels, fractures or lesions spanning multiple slices become much ' +
      'easier to see. Use 0 to disable (single slice). Typical values: 3, 5, ' +
      '10 mm. Effective range: 0 – 50 mm.',
    inputSchema: {
      type: 'object',
      properties: {
        slab_mm: { type: 'number', description: 'Thickness in mm. 0 = off.' },
      },
      required: ['slab_mm'],
    },
  },

  // ── Capture ────────────────────────────────────────────────────────────────
  {
    name: 'capture_slice',
    description:
      'Capture the current view of one plane as a PNG image for visual analysis. ' +
      'Pass slab_mm to render a thicker maximum-intensity-projection slab (a native-' +
      'resolution composite of several adjacent slices) — useful for tracing vessels, ' +
      'fractures or lesions that span multiple slices.',
    inputSchema: {
      type: 'object',
      properties: {
        plane: PLANES,
        slab_mm: {
          type: 'number',
          description:
            'Slab MIP thickness in millimetres (e.g. 3, 5, 10). Omit or 0 for a single slice.',
        },
      },
      required: ['plane'],
    },
  },
  {
    name: 'capture_3d',
    description:
      'Capture a screenshot of the 3-D volume render — including the current render preset, ' +
      'cursor planes, clipping and any AI finding markers. Useful for conveying the overall ' +
      'spatial picture. Set the render preset first if needed. By default it is the camera ' +
      'exactly as the user left it. Pass view = "coronal" | "sagittal" | "axial" to see it ' +
      'from the standard view of that plane (frontal, lateral, top-down), or view = "all" for ' +
      'all three in one answer — the fastest way to check the overall shape, count structures ' +
      'and notice a missing or misplaced part from three sides. The user\'s camera is not moved. ' +
      'Do not read left/right from these views; use the labelled 2-D planes for that.',
    inputSchema: {
      type: 'object',
      properties: {
        view: {
          type: 'string',
          enum: ['current', 'coronal', 'sagittal', 'axial', 'all'],
          description: 'Which camera to use (default "current").',
        },
      },
      required: [],
    },
  },
  {
    name: 'capture_all_planes',
    description:
      'Capture coronal, sagittal and axial views simultaneously at the current crosshair ' +
      'position.  Returns three PNG images in one call — ideal for spatial orientation.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'capture_overview_grid',
    description:
      'Capture N evenly-spaced slices across one anatomical plane and return them as ' +
      'images.  Use this to survey a plane for abnormalities without manual navigation.\n' +
      'count: 2 – 8 slices (default 5).',
    inputSchema: {
      type: 'object',
      properties: {
        plane: PLANES,
        count: { type: 'number', description: 'Number of slices to capture (2–8, default 5).' },
      },
      required: ['plane'],
    },
  },

  // ── Voxel analysis ─────────────────────────────────────────────────────────
  {
    name: 'survey_subject',
    description:
      'FIRST STEP of every study. Returns what the volume contains in numbers, without ' +
      'deciding what it is: grid size and field of view, what the file declares (modality, ' +
      'body part, species, series description — any of which may be missing or wrong), ' +
      'intensity statistics and whether the values look like Hounsfield units, the size, ' +
      'elongation and principal axes of the subject, how much of it is dense, separate ' +
      'pieces, and how mirror-symmetric it is. Use it together with the overview images to ' +
      'say what is being examined (species, body region, orientation) BEFORE reading it.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'roi_stats',
    description:
      'Intensity statistics inside a region, from the voxels: count, volume (mm³), mean, SD, ' +
      'min, max, percentiles (5/25/50/75/95) and a 12-bin histogram. Give a sphere ' +
      '(center + radius_mm; default: the crosshair, 5 mm) or a box (min + max, voxels). Use it ' +
      'to compare a suspicious area with normal tissue instead of judging brightness by eye. ' +
      'MR values are arbitrary units — compare regions of the same scan only.',
    inputSchema: {
      type: 'object',
      properties: {
        center: VOXEL,
        radius_mm: { type: 'number', description: 'Sphere radius in mm (0.5–60, default 5).' },
        min: VOXEL,
        max: VOXEL,
      },
      required: [],
    },
  },
  {
    name: 'line_profile',
    description:
      'Intensities sampled along a straight line between two voxels (trilinear, up to 256 ' +
      'samples) with the position of the steepest edge. Use it for the thickness of a cortex ' +
      'or wall, the sharpness of a margin, or to see whether a dark line crosses a bone.',
    inputSchema: {
      type: 'object',
      properties: {
        from: VOXEL,
        to: VOXEL,
        samples: { type: 'number', description: 'Number of samples (default 64, max 256).' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'slice_curve',
    description:
      'One number per slice along an axis, as a short curve (≤ 120 values) plus its three ' +
      'highest peaks. metric: "area_above" = area (mm²) of voxels above a threshold (default: ' +
      'the tissue threshold) — shows where along the axis the body, a bone or a mass is; ' +
      '"mean"; "max". A cheap way to find WHERE to look before capturing images. axis x = ' +
      'left–right, y = front–back, z = head–foot (after patient alignment).',
    inputSchema: {
      type: 'object',
      properties: {
        axis: { type: 'string', enum: ['x', 'y', 'z'] },
        metric: { type: 'string', enum: ['area_above', 'mean', 'max'] },
        threshold: { type: 'number', description: 'For area_above; default = tissue threshold.' },
        max_points: { type: 'number', description: 'Values to return (default 120).' },
      },
      required: ['axis', 'metric'],
    },
  },
  {
    name: 'find_objects',
    description:
      'Finds the separate connected objects above an intensity threshold and describes each ' +
      'from its voxels: volume (mm³), centroid (voxel), bounding box, extent, length, ' +
      'elongation (1 = ball, large = rod), flatness (large = sheet) and long-axis direction. ' +
      'level "dense" (default) takes the soft/dense Otsu threshold — bone, teeth, implants; ' +
      '"subject" takes the air/tissue one; or give threshold (and threshold_max). ' +
      'split_touching splits objects joined by a narrow neck (teeth in contact). Objects are ' +
      'numbered by size; later calls (axis_profile, check_arrangement) refer to these ids. ' +
      'Use it to count structures, measure true volumes, and notice a part that is missing, ' +
      'extra or detached. Density is only the way objects are separated — what you conclude ' +
      'from their position and shape is up to you.',
    inputSchema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['dense', 'subject'] },
        threshold: { type: 'number' },
        threshold_max: { type: 'number' },
        min_volume_mm3: { type: 'number', description: 'Ignore smaller objects (default 5).' },
        split_touching: { type: 'boolean' },
        max_objects: { type: 'number', description: 'Objects to list (default 25, max 60).' },
        region: voxelBox('Limit the search to a voxel box.'),
      },
      required: [],
    },
  },
  {
    name: 'axis_profile',
    description:
      'Follows one object from find_objects along its long axis: length, straightness, the ' +
      'sharpest bend (angle and where), and equivalent diameter per segment with the ' +
      'narrowest and widest points. Use it for a long bone or a limb: angulation after a ' +
      'fracture, a deformity, a constriction. Compare with the mirrored structure ' +
      '(check_symmetry) before calling a bend abnormal.',
    inputSchema: {
      type: 'object',
      properties: {
        object_id: { type: 'number', description: 'An id from the last find_objects.' },
        segments: { type: 'number', description: 'Segments along the axis (default 24).' },
      },
      required: ['object_id'],
    },
  },
  {
    name: 'check_arrangement',
    description:
      'For objects that should form a regular row — teeth along an arch, vertebrae, ribs — ' +
      'fits a curve through them (robust to outliers) and reports for each: distance off the ' +
      'curve (mm), distance from the row\'s usual level, how much it leans against its ' +
      'neighbours (degrees), the gap to the next one, and plain-language flags. It never ' +
      'looks at density, so a normal-looking structure in the wrong place or at the wrong ' +
      'angle is still found. Run find_objects first (split_touching: true when they touch); ' +
      'needs ≥ 5 objects. plane = the plane the row lies in (axial for a dental arch). Flags ' +
      'are candidates: a wisdom tooth may legitimately lean, a gap may be a normal diastema.',
    inputSchema: {
      type: 'object',
      properties: {
        plane: { type: 'string', enum: ['axial', 'coronal', 'sagittal'] },
        object_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Which objects form the row (default: those of typical size).',
        },
        min_offset_mm: { type: 'number', description: 'Default 3.' },
        min_tilt_excess_deg: { type: 'number', description: 'Default 20.' },
      },
      required: [],
    },
  },
  {
    name: 'check_symmetry',
    description:
      'Finds the plane that best mirrors the subject (tried on all three axes; reports the ' +
      'overlap for each) and lists what has no counterpart on the other side — with side, ' +
      'volume, position and extent — plus left/right volumes and an asymmetry profile along ' +
      'the long axis. A missing or extra limb, a swelling, an absent structure show up here. ' +
      'Meaningful for bilateral anatomy only; low overlap on every axis means the subject is ' +
      'not mirror-symmetric, so differences prove nothing. Resolution is coarse ' +
      '(resolutionVoxels): small differences are not seen. Always confirm on images.',
    inputSchema: {
      type: 'object',
      properties: {
        axis: { type: 'string', enum: ['x', 'y', 'z'] },
        region: voxelBox(
          'Voxel box around the subject. Use it when a couch, a second subject or an off-centre posture drags the overlap down.',
        ),
      },
      required: [],
    },
  },
  {
    name: 'find_gaps',
    description:
      'Looks for thin, flat gaps inside dense material — candidate cracks and fracture ' +
      'lines. For each: position, width (mm), area (mm²), planarity (≈0 flat sheet), ' +
      'enclosure (share with dense material on both faces) and the normal of the gap. ' +
      'Works on CT / CBCT (bone is bright). It also reports joint spaces, sutures, the ' +
      'periodontal space and thin canals, so every candidate must be checked with ' +
      'capture_region across the gap, and compared with the other side. Hairline or ' +
      'non-displaced fractures narrower than the voxel are invisible to it, and on MRI it is ' +
      'not meaningful. Sees gaps up to max_gap_mm (default 2). `smoothed` in the answer ' +
      'means noise forced a blur first, which hides the thinnest gaps.',
    inputSchema: {
      type: 'object',
      properties: {
        threshold: { type: 'number', description: 'Dense-material threshold (default: automatic).' },
        max_gap_mm: { type: 'number', description: 'Widest gap to look for (0.3–8, default 2).' },
        min_area_mm2: { type: 'number', description: 'Default 15.' },
        max_voxels: {
          type: 'number',
          description: 'Most voxels analysed at full resolution (default 40 million); larger volumes are analysed on a coarser grid — use region instead.',
        },
        region: voxelBox('Limit the search to a voxel box — faster and finer on big volumes.'),
      },
      required: [],
    },
  },
  {
    name: 'navigate_to_voxel',
    description:
      'Move the crosshair to a voxel (x, y, z), e.g. the centroid of an object from ' +
      'find_objects or a candidate from find_gaps. Then capture_all_planes shows it in all ' +
      'three planes.',
    inputSchema: {
      type: 'object',
      properties: { voxel: VOXEL },
      required: ['voxel'],
    },
  },
  {
    name: 'capture_region',
    description:
      'A close-up of one plane around a voxel, cropped from the FULL-RESOLUTION slice (not a ' +
      'magnified thumbnail): fov_mm wide (5–400, default 40), up to 1280 px. The answer says ' +
      'mm per pixel and the native voxel size. Use it to examine a candidate, a margin or ' +
      'a thin line at the resolution the scanner actually recorded. Does not move the ' +
      'crosshair. Optional slab_mm for a MIP slab.',
    inputSchema: {
      type: 'object',
      properties: {
        plane: PLANES,
        center: VOXEL,
        fov_mm: { type: 'number' },
        size: { type: 'number', description: 'Long edge in pixels (128–1280, default 640).' },
        slab_mm: { type: 'number' },
      },
      required: ['plane'],
    },
  },
  {
    name: 'capture_montage',
    description:
      'Up to 20 slices of one plane on a single captioned contact sheet (default 12, ' +
      'slab MIP 3 mm). One image costs about as many tokens as three single captures, so ' +
      'this is the way to survey a whole plane. from_slice / to_slice narrow the range ' +
      '(1-based) — use them to zoom into the region a slice_curve pointed at.',
    inputSchema: {
      type: 'object',
      properties: {
        plane: PLANES,
        count: { type: 'number', description: '2–20, default 12.' },
        from_slice: { type: 'number' },
        to_slice: { type: 'number' },
        slab_mm: { type: 'number' },
        size: { type: 'number', description: 'Sheet long edge in pixels (400–1280).' },
      },
      required: ['plane'],
    },
  },

  // ── Annotations ────────────────────────────────────────────────────────────
  {
    name: 'add_annotation',
    description:
      'Place a finding marker on the volume so the user can see it on the 2-D panels AND ' +
      'the 3-D model. The marker is anchored to the slice you place it on and to a 3-D ' +
      'point. Capture the relevant slice first to read the coordinates. Returns the id. ' +
      'The finding belongs to the series that is open now — in a multi-series study, ' +
      'switch_series to the right one first.',
    inputSchema: {
      type: 'object',
      properties: {
        plane: PLANES,
        fx: { type: 'number', description: '0 = left edge, 1 = right edge of the captured image.' },
        fy: { type: 'number', description: '0 = top edge,  1 = bottom edge of the captured image.' },
        label: { type: 'string', description: 'Short title for the finding.' },
        severity: {
          type: 'string',
          enum: ['critical', 'serious', 'moderate', 'comment'],
          description:
            'Clinical severity → colour. critical=red, serious=orange, moderate=yellow, ' +
            'comment=green (an informational note, no danger). Defaults to "serious".',
        },
        summary: {
          type: 'string',
          description: '1–3 sentence explanation shown when the user opens this finding.',
        },
        confidence: {
          type: 'number',
          description:
            'AI certainty as an integer 0–100. Practically never use 100 for medical findings ' +
            '— the model should reflect genuine uncertainty. Typical range: 40–95.',
        },
        size_mm: {
          type: 'number',
          description:
            'Largest in-plane diameter of the finding in millimetres. ' +
            'Only include when a clear measurable boundary is visible (e.g. a lesion, defect, ' +
            'or nodule). Omit for diffuse or poorly-defined findings.',
        },
      },
      required: ['plane', 'fx', 'fy', 'label', 'severity'],
    },
  },
  {
    name: 'remove_annotation',
    description: 'Remove a specific finding marker by the id returned from add_annotation.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Annotation id to remove.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_annotations',
    description:
      'List every finding currently placed, with id, label, severity, plane, voxel ' +
      'position and summary. In a multi-series study it lists the findings of every series ' +
      'shown this session: `series` names the series, `onScreen` says whether it is the ' +
      'open one, and `voxel` is in that series\' own coordinates. Use to review or before ' +
      'removing a specific one.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'clear_annotations',
    description: 'Remove every AI finding marker from the series that is open.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },

  // ── Measurement ────────────────────────────────────────────────────────────
  {
    name: 'set_measurement',
    description:
      'Place a single straight-line measurement segment between two voxel ' +
      'coordinates and let the viewer compute its physical distance in mm ' +
      '(uses the volume voxel spacing). Only ONE measurement exists at a ' +
      'time — calling this again replaces the previous segment. Use voxel ' +
      'coordinates from `get_viewer_state` or from a captured slice. To ' +
      'remove the measurement use `clear_measurement`.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'object',
          description: 'Start voxel.',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          required: ['x', 'y', 'z'],
        },
        to: {
          type: 'object',
          description: 'End voxel.',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          required: ['x', 'y', 'z'],
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_measurement',
    description:
      'Return the currently placed measurement (from/to voxels and the ' +
      'computed distance in mm), or null if none is set.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'clear_measurement',
    description: 'Remove the current measurement segment from the viewer.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

/** Reply wait, ms, when a tool does not say otherwise. */
export const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Tool name → the action the app answers to, and how long to wait.
 * Most analysis tools use their own name as the action; the older ones do not
 * (`get_viewer_state` → `get_state`), which is why the pairs are written out.
 */
export const TOOL_ACTIONS = {
  get_viewer_state: { action: 'get_state' },
  get_volume_overview: { action: 'overview', timeoutMs: 30_000 },
  list_series: { action: 'list_series' },
  switch_series: { action: 'switch_series', timeoutMs: 90_000 }, // re-assembles a large series
  navigate_to_slice: { action: 'navigate' },
  step_slice: { action: 'step' },
  navigate_to_center: { action: 'navigate_center' },
  navigate_to_voxel: { action: 'navigate_to_voxel' },
  set_window_level: { action: 'set_wl' },
  apply_wl_preset: { action: 'apply_wl_preset' },
  set_render_preset: { action: 'set_preset' },
  set_slab_mm: { action: 'set_slab_mm' },
  capture_slice: { action: 'capture_slice' },
  capture_3d: { action: 'capture_3d', timeoutMs: 25_000 },
  capture_all_planes: { action: 'capture_all', timeoutMs: 30_000 },
  capture_overview_grid: { action: 'overview_grid', timeoutMs: 90_000 },
  capture_region: { action: 'capture_region', timeoutMs: 30_000 },
  capture_montage: { action: 'capture_montage', timeoutMs: 60_000 },
  survey_subject: { action: 'survey_subject', timeoutMs: 60_000 },
  roi_stats: { action: 'roi_stats', timeoutMs: 60_000 },
  line_profile: { action: 'line_profile', timeoutMs: 60_000 },
  slice_curve: { action: 'slice_curve', timeoutMs: 60_000 },
  find_objects: { action: 'find_objects', timeoutMs: 60_000 },
  axis_profile: { action: 'axis_profile', timeoutMs: 60_000 },
  check_arrangement: { action: 'check_arrangement', timeoutMs: 60_000 },
  check_symmetry: { action: 'check_symmetry', timeoutMs: 60_000 },
  find_gaps: { action: 'find_gaps', timeoutMs: 60_000 },
  add_annotation: { action: 'add_annotation' },
  remove_annotation: { action: 'remove_annotation' },
  list_annotations: { action: 'list_annotations' },
  clear_annotations: { action: 'clear_annotations' },
  set_measurement: { action: 'set_measurement' },
  get_measurement: { action: 'get_measurement' },
  clear_measurement: { action: 'clear_measurement' },
} as const satisfies Record<string, { action: string; timeoutMs?: number }>;

export type ToolName = keyof typeof TOOL_ACTIONS;
