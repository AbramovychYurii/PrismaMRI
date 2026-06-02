/**
 * useMcpBridge — WebSocket bridge between the app and the MCP server relay.
 *
 * Handles all commands sent by the MCP server and sends results back.
 * Call once at the app root.  No-op when VITE_RELAY_URL is not set.
 */

import { extractSliceGrayImage } from '@/lib/volume/slices';
import { useVolumeStore } from '@/store/volumeStore';
import type {
  AiAnnotation,
  AnnotationSeverity,
  LoadedVolume,
  MeasurementPoint,
  SlicePlane,
  VolumeCursor,
} from '@/types';
import { useCallback, useEffect, useRef, useState } from 'react';

const RELAY_URL = import.meta.env.VITE_RELAY_URL as string | undefined;

// ── Local-mode detection & discovery ─────────────────────────────────────────
// When running as an installed PWA (standalone display mode) or from localhost,
// connect directly to the MCP server's local WS instead of going through relay.
// The same extension works for both modes — no reinstall needed.

const LOCAL_PORTS = [7389, 7390, 7391, 7392, 7393];
const LAST_LOCAL_PORT_KEY = 'prismamri-last-local-port';

function isLocalMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari sets navigator.standalone
    (navigator as { standalone?: boolean }).standalone === true ||
    ['localhost', '127.0.0.1'].includes(location.hostname)
  );
}

/** Try to open ws://127.0.0.1:port within timeoutMs. Resolves with the open socket. */
function tryLocalPort(port: number, timeoutMs = 500): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('timeout'));
    }, timeoutMs);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('error'));
    });
  });
}

/**
 * Probe all LOCAL_PORTS simultaneously and return the first responsive MCP
 * server.  Parallel scanning ensures the total wait is at most `timeoutMs`
 * (300 ms) regardless of how many ports are tried — vs the sequential approach
 * which could take LOCAL_PORTS.length × timeoutMs (1.5 s).
 */
function scanAllLocalPorts(): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    let settled = false;
    let pending = LOCAL_PORTS.length;

    for (const port of LOCAL_PORTS) {
      tryLocalPort(port, 300)
        .then((ws) => {
          if (!settled) {
            settled = true;
            resolve(ws);
          } else {
            ws.close(); // extra successful probe — discard
          }
        })
        .catch(() => {
          pending--;
          if (!settled && pending === 0) resolve(null);
        });
    }
  });
}

/**
 * Try the last known port first (from localStorage) to avoid noisy failed
 * WebSocket attempts in the console on every reload.  Falls back to a full
 * parallel scan of all LOCAL_PORTS when the cached port is stale or absent.
 */
async function findLocalServer(): Promise<WebSocket | null> {
  const cached = localStorage.getItem(LAST_LOCAL_PORT_KEY);
  if (cached) {
    const port = Number(cached);
    if (LOCAL_PORTS.includes(port)) {
      try {
        return await tryLocalPort(port, 300);
      } catch {
        // cached port no longer listening — fall through to full scan
      }
    }
  }
  return scanAllLocalPorts();
}

const SEVERITIES: AnnotationSeverity[] = ['critical', 'serious', 'moderate', 'comment'];

// ── Protocol types ────────────────────────────────────────────────────────────

type IncomingMessage =
  | { type: 'pong' }
  | { type: 'ping' } // local mode: server pings us, we pong back
  | { type: 'mcp_connecting' }
  | { type: 'mcp_disconnected' }
  | { type: 'cmd'; id: string; action: string; [key: string]: unknown };

type OutgoingResult =
  | { type: 'result'; id: string; ok: true; data?: unknown }
  | { type: 'result'; id: string; ok: false; error: string };

// ── Pure helpers ──────────────────────────────────────────────────────────────

function sliceIndex(cursor: { x: number; y: number; z: number }, plane: SlicePlane): number {
  return plane === 'coronal' ? cursor.y + 1 : plane === 'sagittal' ? cursor.x + 1 : cursor.z + 1;
}

function sliceTotal(dims: [number, number, number], plane: SlicePlane): number {
  return plane === 'coronal' ? dims[1] : plane === 'sagittal' ? dims[0] : dims[2];
}

function clampVoxel(v: number, max: number): number {
  return Math.max(0, Math.min(max - 1, v));
}

function stripDataUrl(url: string): string {
  return url.replace(/^data:image\/png;base64,/, '');
}

function captureCanvas(canvas: HTMLCanvasElement): string {
  return stripDataUrl(canvas.toDataURL('image/png'));
}

/** Wait for two animation frames so React has flushed all canvas draws. */
function waitForPaint(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

/**
 * Derive a full voxel position from a plane + canvas fraction + current cursor,
 * so a 2-D placement also yields a 3-D-anchored point. Mirrors cursorFromClick.
 */
function voxelFromFrac(
  plane: SlicePlane,
  fx: number,
  fy: number,
  cursor: VolumeCursor,
  dims: readonly [number, number, number],
): VolumeCursor {
  const [w, h, d] = dims;
  const v: VolumeCursor = { ...cursor };
  if (plane === 'coronal') {
    v.x = Math.round(fx * (w - 1));
    v.z = Math.round((1 - fy) * (d - 1));
  } else if (plane === 'sagittal') {
    v.y = Math.round(fx * (h - 1));
    v.z = Math.round((1 - fy) * (d - 1));
  } else {
    v.x = Math.round(fx * (w - 1));
    v.y = Math.round(fy * (h - 1));
  }
  return v;
}

// ── Anatomy snapping ──────────────────────────────────────────────────────────

/**
 * Read a single voxel's scalar value (post slope/intercept).
 * Returns −Infinity if the coordinate is outside the volume bounds.
 */
function getVoxelScalar(
  voxels: Float32Array | Int16Array,
  dims: readonly [number, number, number],
  x: number,
  y: number,
  z: number,
): number {
  const [w, h, d] = dims;
  if (x < 0 || x >= w || y < 0 || y >= h || z < 0 || z >= d) return Number.NEGATIVE_INFINITY;
  return voxels[x + y * w + z * w * h];
}

/**
 * If the target voxel lands in air / outside anatomy, walk one step at a time
 * toward the slice centre (on the two axes visible in the current plane) until
 * we find a voxel above the tissue threshold.
 *
 * Threshold is adaptive: scalarMin + 15 % of the full scalar range, which
 * safely separates air from soft tissue and bone across CT and CBCT modalities.
 *
 * Returns the original voxel unchanged when it is already inside anatomy.
 */
function snapToAnatomy(voxel: VolumeCursor, plane: SlicePlane, volume: LoadedVolume): VolumeCursor {
  const threshold = volume.scalarMin + (volume.scalarMax - volume.scalarMin) * 0.15;
  const { voxels, meta } = volume;
  const { dims } = meta;

  if (getVoxelScalar(voxels, dims, voxel.x, voxel.y, voxel.z) >= threshold) return voxel;

  // Centre of the volume on each axis.
  const cx = Math.floor(dims[0] / 2);
  const cy = Math.floor(dims[1] / 2);
  const cz = Math.floor(dims[2] / 2);

  let { x, y, z } = voxel;

  for (let step = 0; step < 300; step++) {
    // Move one step toward slice-plane centre on the two displayed axes.
    if (plane === 'coronal') {
      if (x !== cx) x += x > cx ? -1 : 1;
      if (z !== cz) z += z > cz ? -1 : 1;
    } else if (plane === 'sagittal') {
      if (y !== cy) y += y > cy ? -1 : 1;
      if (z !== cz) z += z > cz ? -1 : 1;
    } else {
      if (x !== cx) x += x > cx ? -1 : 1;
      if (y !== cy) y += y > cy ? -1 : 1;
    }
    if (getVoxelScalar(voxels, dims, x, y, z) >= threshold) return { x, y, z };
  }

  return voxel; // fallback: original position if anatomy not found
}

/** Slab thickness in mm → half-slab slice count for a plane. */
function halfSlabsFor(
  plane: SlicePlane,
  slabMm: number,
  spacing: readonly [number, number, number],
): number {
  if (slabMm <= 0) return 0;
  const mmPerSlice = plane === 'axial' ? spacing[2] : plane === 'coronal' ? spacing[1] : spacing[0];
  return Math.max(1, Math.round(slabMm / 2 / mmPerSlice));
}

/** Render a grayscale SliceImage to a base64 PNG at native slice resolution. */
function renderSliceToPng(image: {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create 2D context');
  ctx.putImageData(
    new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
    0,
    0,
  );
  return stripDataUrl(canvas.toDataURL('image/png'));
}

/** Convert a Blob to a base64 string (no data-URL prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(stripDataUrl(reader.result as string));
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

const ACTION_LABELS: Record<string, string> = {
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

// W/L presets as fractions of [scalarMin, scalarMax].
// Each entry: [windowFraction, levelFraction from min]
const WL_PRESETS: Record<string, [number, number]> = {
  full_range: [1.0, 0.5],
  t1: [0.6, 0.5],
  t2: [0.7, 0.65],
  flair: [0.65, 0.6],
  soft_tissue: [0.35, 0.55],
  bone: [0.9, 0.7],
  high_contrast: [0.25, 0.5],
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/** Milliseconds of command inactivity before the session banner is hidden. */
const SESSION_IDLE_MS = 20_000;

export function useMcpBridge(sessionId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Timestamp of the last pong received from the relay (relay mode only). */
  const lastPongAt = useRef<number>(Date.now());
  /** Prevents concurrent connect() calls while async port-scan is in flight. */
  const connectingRef = useRef(false);
  /** True when the current socket is a direct local connection (not relay). */
  const localModeRef = useRef(false);
  /**
   * When connected via relay in local mode, this timer periodically scans for
   * a local MCP server and upgrades the connection as soon as one appears.
   */
  const localUpgradeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const store = useVolumeStore;

  // ── Leader election via Web Locks ────────────────────────────────────────────
  // Only one tab manages the WebSocket bridge at a time.  The first tab to
  // acquire the 'prismamri-mcp-bridge' lock becomes the leader; others wait.
  // When the leader tab closes, the next-in-queue tab takes over automatically.
  const [isLeader, setIsLeader] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    // Resolving this promise releases the lock and relinquishes leadership.
    let releaseLock: (() => void) | null = null;
    const held = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    if (!('locks' in navigator)) {
      // Fallback for environments without Web Locks (rare) — behave as before.
      setIsLeader(true);
    } else {
      navigator.locks
        .request('prismamri-mcp-bridge', { signal: abort.signal }, async () => {
          setIsLeader(true);
          await held;
          setIsLeader(false);
        })
        .catch(() => {
          // AbortError — component unmounted before the lock was ever acquired.
        });
    }

    return () => {
      abort.abort(); // cancel a pending (not-yet-acquired) lock request
      releaseLock?.(); // release an acquired lock so the next tab can take over
    };
    // Intentionally empty deps — lock is held for the full lifetime of this tab.
  }, []);

  const clearSessionIdle = useCallback(() => {
    if (sessionIdleTimer.current) {
      clearTimeout(sessionIdleTimer.current);
      sessionIdleTimer.current = null;
    }
  }, []);

  const scheduleSessionIdle = useCallback(() => {
    clearSessionIdle();
    sessionIdleTimer.current = setTimeout(() => {
      store.getState().setAgentSessionActive(false);
      sessionIdleTimer.current = null;
    }, SESSION_IDLE_MS);
  }, [clearSessionIdle, store]);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  // ── Command dispatcher ───────────────────────────────────────────────────

  const handleCommand = useCallback(
    async (msg: Extract<IncomingMessage, { type: 'cmd' }>) => {
      const { id, action } = msg;

      // Mark session active and reset the idle countdown.
      clearSessionIdle();
      store.getState().setAgentSessionActive(true);
      store.getState().setAgentActivity(true, ACTION_LABELS[action] ?? action);

      const finish = () => {
        store.getState().setAgentActivity(false);
        scheduleSessionIdle();
      };

      const ok = (data?: unknown) => {
        finish();
        send({ type: 'result', id, ok: true, data } satisfies OutgoingResult);
      };
      const fail = (error: string) => {
        finish();
        send({ type: 'result', id, ok: false, error } satisfies OutgoingResult);
      };

      try {
        switch (action) {
          // ── get_state ──────────────────────────────────────────────────
          case 'get_state': {
            const { volume, cursor, wl, renderPreset } = store.getState();
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
            break;
          }

          // ── overview — metadata + centre captures of all 3 planes ──────
          case 'overview': {
            const { volume, cursor: cur } = store.getState();
            if (!volume || !cur) {
              fail('No volume loaded');
              break;
            }

            const { dims, spacing, modality, scanner, protocol } = volume.meta;
            const centre = {
              x: Math.floor(dims[0] / 2),
              y: Math.floor(dims[1] / 2),
              z: Math.floor(dims[2] / 2),
            };
            store.getState().setCursor(centre);
            await waitForPaint();
            // Extra tick — three canvases all need to redraw.
            await new Promise((r) => setTimeout(r, 80));

            const refs = store.getState().canvasRefs;
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
                coronal: refs.coronal ? captureCanvas(refs.coronal) : null,
                sagittal: refs.sagittal ? captureCanvas(refs.sagittal) : null,
                axial: refs.axial ? captureCanvas(refs.axial) : null,
              },
            });
            break;
          }

          // ── navigate — absolute slice index ────────────────────────────
          case 'navigate': {
            const plane = msg.plane as SlicePlane;
            const slice = msg.slice as number;
            const { cursor, volume } = store.getState();
            if (!cursor || !volume) {
              fail('No volume loaded');
              break;
            }
            const dims = volume.meta.dims;
            const cur = { ...cursor };
            if (plane === 'coronal') cur.y = clampVoxel(slice - 1, dims[1]);
            if (plane === 'sagittal') cur.x = clampVoxel(slice - 1, dims[0]);
            if (plane === 'axial') cur.z = clampVoxel(slice - 1, dims[2]);
            store.getState().setCursor(cur);
            ok();
            break;
          }

          // ── step — relative navigation ─────────────────────────────────
          case 'step': {
            const plane = msg.plane as SlicePlane;
            const steps = msg.steps as number;
            const { cursor, volume } = store.getState();
            if (!cursor || !volume) {
              fail('No volume loaded');
              break;
            }
            const dims = volume.meta.dims;
            const total = sliceTotal(dims, plane);
            const cur = { ...cursor };
            if (plane === 'coronal') cur.y = clampVoxel(cursor.y + steps, dims[1]);
            if (plane === 'sagittal') cur.x = clampVoxel(cursor.x + steps, dims[0]);
            if (plane === 'axial') cur.z = clampVoxel(cursor.z + steps, dims[2]);
            store.getState().setCursor(cur);
            ok({ slice: sliceIndex(cur, plane), total });
            break;
          }

          // ── navigate_center ────────────────────────────────────────────
          case 'navigate_center': {
            const { volume } = store.getState();
            if (!volume) {
              fail('No volume loaded');
              break;
            }
            const { dims } = volume.meta;
            const centre = {
              x: Math.floor(dims[0] / 2),
              y: Math.floor(dims[1] / 2),
              z: Math.floor(dims[2] / 2),
            };
            store.getState().setCursor(centre);
            ok({
              sliceIndices: {
                coronal: centre.y + 1,
                sagittal: centre.x + 1,
                axial: centre.z + 1,
              },
            });
            break;
          }

          // ── set_wl ────────────────────────────────────────────────────
          case 'set_wl': {
            const wl = { window: msg.window as number, level: msg.level as number };
            store.getState().setWL(wl);
            store.getState().setWLDraft(wl);
            ok();
            break;
          }

          // ── apply_wl_preset ───────────────────────────────────────────
          case 'apply_wl_preset': {
            const preset = msg.preset as string;
            const { volume } = store.getState();
            if (!volume) {
              fail('No volume loaded');
              break;
            }
            const fracs = WL_PRESETS[preset] ?? WL_PRESETS.full_range;
            const range = volume.scalarMax - volume.scalarMin;
            const wl = {
              window: range * fracs[0],
              level: volume.scalarMin + range * fracs[1],
            };
            store.getState().setWL(wl);
            store.getState().setWLDraft(wl);
            ok(wl);
            break;
          }

          // ── set_preset (3-D render) ───────────────────────────────────
          case 'set_preset': {
            store.getState().setRenderPreset(msg.preset as 'mip' | 'tissue' | 'bone');
            ok();
            break;
          }

          // ── set_slab_mm — slab-MIP thickness for all panels ───────────
          case 'set_slab_mm': {
            const raw = Number(msg.slab_mm);
            if (!Number.isFinite(raw) || raw < 0) {
              fail('slab_mm must be a non-negative number');
              break;
            }
            const slabMm = Math.min(50, raw);
            store.getState().setSlabMm(slabMm);
            ok({ slabMm });
            break;
          }

          // ── capture_slice ─────────────────────────────────────────────
          case 'capture_slice': {
            const plane = msg.plane as SlicePlane;
            const slabMm = (msg.slab_mm as number | undefined) ?? 0;

            // With a slab thickness, render a native-resolution slab-MIP image
            // straight from the voxel buffer (sharper than a canvas grab, and
            // independent of the panel's current slab setting).
            if (slabMm > 0) {
              const { volume, cursor, wl } = store.getState();
              if (!volume || !cursor) {
                fail('No volume loaded');
                break;
              }
              const index =
                plane === 'coronal' ? cursor.y : plane === 'sagittal' ? cursor.x : cursor.z;
              const half = halfSlabsFor(plane, slabMm, volume.meta.spacing);
              const image = extractSliceGrayImage(volume, plane, index, wl, half);
              ok({ imageData: renderSliceToPng(image), slabMm });
              break;
            }

            const canvas = store.getState().canvasRefs[plane];
            if (!canvas) {
              fail(`Canvas for ${plane} not available`);
              break;
            }
            await waitForPaint();
            ok({ imageData: captureCanvas(canvas) });
            break;
          }

          // ── capture_3d — screenshot the 3-D model ─────────────────────
          case 'capture_3d': {
            const preview = store.getState().previewInstance;
            if (!preview) {
              fail('3-D view not ready');
              break;
            }
            await waitForPaint();
            const blob = await preview.exportPNG();
            ok({ imageData: await blobToBase64(blob) });
            break;
          }

          // ── capture_all — all 3 planes at once ────────────────────────
          case 'capture_all': {
            await waitForPaint();
            const refs = store.getState().canvasRefs;
            if (!refs.coronal || !refs.sagittal || !refs.axial) {
              fail('One or more plane canvases not available');
              break;
            }
            ok({
              coronal: captureCanvas(refs.coronal),
              sagittal: captureCanvas(refs.sagittal),
              axial: captureCanvas(refs.axial),
            });
            break;
          }

          // ── overview_grid — N evenly-spaced slices on one plane ───────
          case 'overview_grid': {
            const plane = msg.plane as SlicePlane;
            const count = Math.min(8, Math.max(2, (msg.count as number) ?? 5));
            const { cursor, volume } = store.getState();
            if (!cursor || !volume) {
              fail('No volume loaded');
              break;
            }

            const dims = volume.meta.dims;
            const total = sliceTotal(dims, plane);
            const canvas = store.getState().canvasRefs[plane];
            if (!canvas) {
              fail(`Canvas for ${plane} not available`);
              break;
            }

            // Build evenly-spaced 1-based indices.
            const indices = Array.from({ length: count }, (_, i) =>
              Math.round(1 + (i / (count - 1)) * (total - 1)),
            );

            const saved = { ...cursor };
            const images: string[] = [];

            for (const slice of indices) {
              const cur = { ...store.getState().cursor! };
              if (plane === 'coronal') cur.y = clampVoxel(slice - 1, dims[1]);
              if (plane === 'sagittal') cur.x = clampVoxel(slice - 1, dims[0]);
              if (plane === 'axial') cur.z = clampVoxel(slice - 1, dims[2]);
              store.getState().setCursor(cur);
              await waitForPaint();
              images.push(captureCanvas(canvas));
            }

            // Restore original position.
            store.getState().setCursor(saved);
            ok({ images, indices, total });
            break;
          }

          // ── add_annotation ────────────────────────────────────────────
          case 'add_annotation': {
            const { cursor, volume } = store.getState();
            if (!cursor || !volume) {
              fail('No volume loaded');
              break;
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
            const annotation: AiAnnotation = {
              id: crypto.randomUUID(),
              plane,
              fx,
              fy,
              voxel: snappedVoxel,
              label: msg.label as string,
              summary: msg.summary as string | undefined,
              severity,
              confidence: rawConfidence != null ? Math.min(100, Math.max(0, Math.round(rawConfidence))) : undefined,
              sizeMm: msg.size_mm != null ? Number(msg.size_mm) : undefined,
            };
            store.getState().addAiAnnotation(annotation);
            // Focus the new finding so it's immediately visible to the user.
            store.getState().setActiveAnnotation(annotation.id);
            ok({ id: annotation.id });
            break;
          }

          // ── remove_annotation ─────────────────────────────────────────
          case 'remove_annotation': {
            const removeId = msg.id as string;
            if (!store.getState().aiAnnotations.some((a) => a.id === removeId)) {
              fail(`Annotation ${removeId} not found`);
              break;
            }
            store.getState().removeAiAnnotation(removeId);
            ok();
            break;
          }

          // ── list_annotations ──────────────────────────────────────────
          case 'list_annotations': {
            const list = store.getState().aiAnnotations.map((a) => ({
              id: a.id,
              plane: a.plane,
              voxel: a.voxel,
              label: a.label,
              summary: a.summary ?? null,
              severity: a.severity,
            }));
            ok({ annotations: list, count: list.length });
            break;
          }

          // ── clear_annotations ─────────────────────────────────────────
          case 'clear_annotations': {
            store.getState().clearAiAnnotations();
            ok();
            break;
          }

          // ── set_measurement — place both endpoints in one call ────────
          // Only one segment is active at a time; calling again replaces it.
          case 'set_measurement': {
            const { volume } = store.getState();
            if (!volume) {
              fail('No volume loaded');
              break;
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
              break;
            }
            // Replace any existing measurement atomically — placing `from`
            // wipes the prior `to`, then we set `to` to finalize distance.
            store.getState().setMeasurementFrom(from);
            store.getState().setMeasurementTo(to);
            const m = store.getState().measurement;
            ok({
              from,
              to,
              distanceMm: m?.distanceMm ?? null,
            });
            break;
          }

          // ── get_measurement ───────────────────────────────────────────
          case 'get_measurement': {
            const m = store.getState().measurement;
            ok({
              hasMeasurement: m !== null,
              from: m?.from ?? null,
              to: m?.to ?? null,
              distanceMm: m?.distanceMm ?? null,
            });
            break;
          }

          // ── clear_measurement ─────────────────────────────────────────
          case 'clear_measurement': {
            store.getState().clearMeasurement();
            ok();
            break;
          }

          default:
            fail(`Unknown action: ${action}`);
        }
      } catch (err) {
        fail((err as Error).message ?? 'Internal error');
      }
    },
    [send, store, clearSessionIdle, scheduleSessionIdle],
  );

  // ── WebSocket lifecycle ──────────────────────────────────────────────────

  // Refs so that connect() doesn't need sessionId/handleCommand in its deps
  // and therefore never triggers an effect re-run (and disconnect) when those
  // values change after the initial mount.
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const handleCommandRef = useRef(handleCommand);
  handleCommandRef.current = handleCommand;

  const connect = useCallback(() => {
    // Bail out if already connected or a connection attempt is in flight.
    if (wsRef.current || connectingRef.current) return;

    // ── Decide mode and acquire a WebSocket ────────────────────────────────
    // Run asynchronously so port-scanning doesn't block the call site.
    void (async () => {
      connectingRef.current = true;
      let ws: WebSocket | null = null;
      let isLocal = false;

      // Always try the local MCP server first — the Claude extension runs a WS
      // on 127.0.0.1 and a direct connection is always preferred over the relay.
      // Parallel port-scan (300 ms max) keeps the overhead negligible even when
      // no local server is running.
      console.debug('[mcp-bridge] scanning local ports…', { isLocalMode: isLocalMode() });
      ws = await findLocalServer();
      console.debug('[mcp-bridge] findLocalServer →', ws ? `found ${ws.url}` : 'not found');
      if (ws) {
        isLocal = true;
        // Extract port from ws://127.0.0.1:PORT and persist it for the UI.
        const port = Number(new URL(ws.url).port);
        if (port) {
          store.getState().setLocalPort(port);
          localStorage.setItem(LAST_LOCAL_PORT_KEY, String(port));
        }
      }

      // Fallback: Cloudflare relay (web-app mode or when local server absent).
      // Use the ref so we always get the latest sessionId even if it resolved
      // after findLocalServer() started (avoids relay fallback with a null ID).
      if (!ws && RELAY_URL && sessionIdRef.current) {
        const wsBase = RELAY_URL.replace(/^http/, 'ws').replace(/\/$/, '');
        ws = new WebSocket(`${wsBase}/ws?session=${sessionIdRef.current}&role=app`);
        console.debug('[mcp-bridge] falling back to relay');
      }

      if (!ws) {
        connectingRef.current = false;
        return; // nothing to connect to — wait for next trigger
      }

      // Register the socket BEFORE releasing the connecting guard so no
      // concurrent connect() call can slip into the gap between the two.
      wsRef.current = ws;
      localModeRef.current = isLocal;
      connectingRef.current = false;

      // In local mode the MCP server is already running; mark connected now
      // (no mcp_connecting event will arrive over the relay).
      if (isLocal) store.getState().setMcpConnected(true);

      // ── Proactive local upgrade ───────────────────────────────────────────
      // If we fell back to the relay (local server wasn't available yet) but
      // we're running as an installed PWA, poll for the local server in the
      // background.  As soon as it appears we tear down the relay connection
      // and let connect() reattach directly — no manual page reload needed.
      if (!isLocal && isLocalMode()) {
        const tryUpgrade = async () => {
          const currentWs = wsRef.current;
          if (!currentWs || localModeRef.current) return; // already local or gone
          // Relay not open yet — reschedule instead of bailing permanently
          if (currentWs.readyState !== WebSocket.OPEN) {
            console.debug('[mcp-bridge] upgrade: relay not open yet, retrying in 2s');
            localUpgradeRef.current = setTimeout(() => { void tryUpgrade(); }, 2_000);
            return;
          }

          console.debug('[mcp-bridge] upgrade: scanning for local server…');
          const probe = await findLocalServer();
          console.debug('[mcp-bridge] upgrade probe →', probe ? `found ${probe.url}` : 'not found');
          if (!probe) {
            // Not available yet — check again in 5 s.
            localUpgradeRef.current = setTimeout(() => {
              void tryUpgrade();
            }, 5_000);
            return;
          }
          // Found the local server.  Discard the probe socket — connect() will
          // open a fresh one — and close the relay to trigger an immediate reconnect.
          console.debug('[mcp-bridge] upgrading to local connection');
          probe.close();
          localUpgradeRef.current = null;
          wsRef.current = null; // prevent the close handler scheduling a 5 s delay
          currentWs.close(1000, 'upgrading to local connection');
          connect(); // reconnects immediately; local server found → isLocal = true
        };
        localUpgradeRef.current = setTimeout(() => {
          void tryUpgrade();
        }, 5_000);
      }

      // ── Open handler ────────────────────────────────────────────────────
      ws.addEventListener('open', () => {
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
        lastPongAt.current = Date.now();

        if (!isLocal) {
          // Relay mode: we ping Cloudflare every 20 s to keep the Durable
          // Object alive and detect silently-dead connections (no pong for 50 s).
          heartbeatTimer.current = setInterval(() => {
            const sock = wsRef.current;
            if (!sock || sock.readyState !== WebSocket.OPEN) return;
            if (document.visibilityState === 'hidden') {
              lastPongAt.current = Date.now(); // don't penalise throttled tabs
              return;
            }
            if (Date.now() - lastPongAt.current > 50_000) {
              sock.close(1000, 'pong-timeout');
              return;
            }
            sock.send('{"type":"ping"}');
          }, 20_000);
        }
        // Local mode: the MCP server pings us — we just respond (see message handler).
      });

      // ── Message handler ─────────────────────────────────────────────────
      ws.addEventListener('message', (event: MessageEvent<string>) => {
        let msg: IncomingMessage;
        try {
          msg = JSON.parse(event.data) as IncomingMessage;
        } catch {
          return;
        }

        if (msg.type === 'ping') {
          // Local mode: server keepalive — send pong back.
          wsRef.current?.send('{"type":"pong"}');
          return;
        }
        if (msg.type === 'pong') {
          lastPongAt.current = Date.now();
          return;
        }
        if (msg.type === 'mcp_connecting') {
          store.getState().setMcpConnected(true);
          return;
        }
        if (msg.type === 'mcp_disconnected') {
          store.getState().setMcpConnected(false);
          clearSessionIdle();
          store.getState().setAgentSessionActive(false);
          return;
        }
        if (msg.type === 'cmd') void handleCommandRef.current(msg);
      });

      // ── Close handler ───────────────────────────────────────────────────
      ws.addEventListener('close', (evt) => {
        console.debug('[mcp-bridge] ws closed', evt.code, evt.reason || '(none)', { wasClean: evt.wasClean });

        // Always stop the heartbeat for this specific socket.
        if (heartbeatTimer.current) {
          clearInterval(heartbeatTimer.current);
          heartbeatTimer.current = null;
        }

        // If wsRef was already replaced (e.g. by a local upgrade that raced
        // ahead before this close event fired), do NOT clobber the new
        // connection or schedule a redundant reconnect — connect() is already
        // running or has already completed.
        if (wsRef.current !== ws) {
          console.debug('[mcp-bridge] close: skipping cleanup — wsRef already replaced');
          return;
        }

        wsRef.current = null;
        localModeRef.current = false;
        store.getState().setMcpConnected(false);
        store.getState().setLocalPort(null);
        const wasLocal = isLocal;
        // code 1001 = superseded by another client connecting to the same port
        // code 1008 = server rejected us (another healthy connection is active)
        // Both indicate a competing client — back off with jitter so the two
        // clients de-synchronise and one gets to stabilise.
        const competing = evt.code === 1001 || evt.code === 1008;
        const delay = wasLocal
          ? competing
            ? 2_000 + Math.floor(Math.random() * 3_000) // 2–5 s random
            : 1_000
          : 5_000;
        console.debug('[mcp-bridge] scheduling reconnect in', delay, 'ms', competing ? '(backoff — competing client)' : '');
        reconnectTimer.current = setTimeout(() => {
          reconnectTimer.current = null;
          connect();
        }, delay);
      });

      ws.addEventListener('error', (evt) => {
        console.debug('[mcp-bridge] ws error', evt.type, ws.url);
        /* close fires next */
      });
    })();
  // sessionId and handleCommand are accessed via refs — removing them from deps
  // prevents connect() from changing identity (and triggering an effect re-run
  // that would tear down the live socket) every time sessionId resolves on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, clearSessionIdle]);

  useEffect(() => {
    if (!isLeader) return;
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      if (localUpgradeRef.current) clearTimeout(localUpgradeRef.current);
      clearSessionIdle();
      wsRef.current?.close(1000, 'unmount');
      wsRef.current = null;
    };
  }, [isLeader, connect, clearSessionIdle]);

  // When the browser tab becomes visible again (user switches back), reconnect
  // immediately if the WebSocket is gone — browsers throttle timers in hidden
  // tabs, so the pong-timeout may fire late and the reconnect timer may not
  // have run yet.  Only the leader tab manages the WebSocket.
  useEffect(() => {
    if (!isLeader) return;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      // Reset pong clock — the heartbeat timer was throttled while hidden,
      // so elapsed time is meaningless; don't trigger a false pong-timeout.
      lastPongAt.current = Date.now();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
      // Cancel any pending slow reconnect and connect right now.
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      wsRef.current = null; // ensure connect() doesn't bail out early
      connect();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isLeader, connect]);
}
