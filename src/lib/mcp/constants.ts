/**
 * Shared MCP (Model Context Protocol) constants used by both the WebSocket
 * bridge (`useMcpBridge`) and the UI panels (`SessionPanel`).
 *
 * Keep this file pure — no React, no styled-components, no Zustand. Everything
 * here is just data + protocol tuning knobs.
 */

import type { AnnotationSeverity } from '@prisma-mri/viewer-core';

/** Ports the MCP server tries in order. Must match mcp-server/src/index.ts. */
export const LOCAL_PORTS = [7389, 7390, 7391, 7392, 7393] as const;

/** Per-port probe timeout when scanning for a running MCP server. */
export const LOCAL_PROBE_TIMEOUT_MS = 300;

/** How often, while connected to at least one server, to look for another that started later. */
export const LOCAL_RESCAN_MS = 15_000;

/** Claude's practical limit for a single image payload sent via MCP. */
export const MCP_MAX_EDGE = 512;

/** Long-edge cap for the larger images the analysis tools return (the API reads up to ~1568 px). */
export const MCP_ANALYSIS_MAX_EDGE = 1280;

/** Quality for detailed single-slice captures — high enough to preserve fine anatomy. */
export const MCP_JPEG_QUALITY = 0.92;

/** Thickest slab MIP a command may ask for, mm. */
export const MAX_SLAB_MM = 50;

/** Milliseconds of command inactivity before the session banner is hidden. */
export const SESSION_IDLE_MS = 20_000;

/** Allowed annotation severities — also the runtime validation whitelist. */
export const SEVERITIES: AnnotationSeverity[] = ['critical', 'serious', 'moderate', 'comment'];

/**
 * Action name → human-readable label shown while the agent is performing the
 * action. Unknown actions fall back to the raw action string.
 */
export const ACTION_LABELS: Record<string, string> = {
  get_state: 'Reading viewer state',
  overview: 'Getting volume overview',
  navigate: 'Navigating to slice',
  step: 'Stepping slice',
  navigate_center: 'Centering view',
  set_wl: 'Adjusting window / level',
  apply_wl_preset: 'Applying W/L preset',
  set_preset: 'Changing render preset',
  set_slab_mm: 'Adjusting slab MIP thickness',
  capture_slice: 'Capturing slice',
  capture_3d: 'Capturing 3D view',
  capture_all: 'Capturing all planes',
  overview_grid: 'Building overview grid',
  add_annotation: 'Adding annotation',
  remove_annotation: 'Removing annotation',
  list_annotations: 'Listing annotations',
  clear_annotations: 'Clearing annotations',
  set_measurement: 'Placing measurement',
  get_measurement: 'Reading measurement',
  clear_measurement: 'Clearing measurement',
  survey_subject: 'Surveying the subject',
  roi_stats: 'Measuring a region',
  line_profile: 'Sampling a line',
  slice_curve: 'Scanning slice by slice',
  find_objects: 'Finding separate objects',
  axis_profile: 'Following an object along its axis',
  check_arrangement: 'Checking how objects are arranged',
  check_symmetry: 'Comparing the two sides',
  find_gaps: 'Looking for thin gaps in dense material',
  navigate_to_voxel: 'Moving to a point',
  list_series: 'Listing series',
  switch_series: 'Switching series',
  capture_region: 'Capturing a close-up',
  capture_montage: 'Building a contact sheet',
};

/**
 * W/L presets as fractions of `[scalarMin, scalarMax]`.
 * Each entry: `[windowFraction, levelFraction from min]`.
 *
 * Resolved to concrete HU values at runtime against the active volume's
 * scalar range, so presets adapt to any modality.
 */
export const WL_PRESETS: Record<string, [number, number]> = {
  full_range: [1.0, 0.5],
  t1: [0.6, 0.5],
  t2: [0.7, 0.65],
  flair: [0.65, 0.6],
  soft_tissue: [0.35, 0.55],
  bone: [0.9, 0.7],
  high_contrast: [0.25, 0.5],
};
