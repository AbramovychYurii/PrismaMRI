/**
 * Shared MCP (Model Context Protocol) constants used by both the WebSocket
 * bridge (`useMcpBridge`) and the UI panels (`SessionPanel`).
 *
 * Keep this file pure — no React, no styled-components, no Zustand. Everything
 * here is just data + protocol tuning knobs.
 */

import type { AnnotationSeverity } from '@/types';

// ── Local WebSocket discovery ────────────────────────────────────────────────

/** Ports the MCP server tries in order. Must match mcp-server/src/index.ts. */
export const LOCAL_PORTS = [7389, 7390, 7391, 7392, 7393] as const;

/** localStorage key for caching the most recently used local port. */
export const LAST_LOCAL_PORT_KEY = 'prismamri-last-local-port';

/** Per-port probe timeout when scanning for a running MCP server. */
export const LOCAL_PROBE_TIMEOUT_MS = 300;

// ── Image capture limits ─────────────────────────────────────────────────────

/** Claude's practical limit for a single image payload sent via MCP. */
export const MCP_MAX_EDGE = 512;

/** Quality for detailed single-slice captures — high enough to preserve fine anatomy. */
export const MCP_JPEG_QUALITY = 0.92;

// ── Session lifecycle ────────────────────────────────────────────────────────

/** Milliseconds of command inactivity before the session banner is hidden. */
export const SESSION_IDLE_MS = 20_000;

// ── Annotation domain ────────────────────────────────────────────────────────

/** Allowed annotation severities — also the runtime validation whitelist. */
export const SEVERITIES: AnnotationSeverity[] = ['critical', 'serious', 'moderate', 'comment'];

// ── UI labels for the agent activity indicator ──────────────────────────────

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
};

// ── Window / level presets ───────────────────────────────────────────────────

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
