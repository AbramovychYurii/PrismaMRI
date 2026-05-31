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
  SlicePlane,
  VolumeCursor,
} from '@/types';
import { useCallback, useEffect, useRef } from 'react';

const RELAY_URL = import.meta.env.VITE_RELAY_URL as string | undefined;

const SEVERITIES: AnnotationSeverity[] = ['critical', 'serious', 'moderate', 'comment'];

// ── Protocol types ────────────────────────────────────────────────────────────

type IncomingMessage =
  | { type: 'pong' }
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
  capture_slice: 'Capturing slice',
  capture_3d: 'Capturing 3D view',
  capture_all: 'Capturing all planes',
  overview_grid: 'Building overview grid',
  add_annotation: 'Adding annotation',
  remove_annotation: 'Removing annotation',
  list_annotations: 'Listing annotations',
  clear_annotations: 'Clearing annotations',
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
  /** Timestamp of the last pong received from the relay. */
  const lastPongAt = useRef<number>(Date.now());
  const store = useVolumeStore;

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
            const annotation: AiAnnotation = {
              id: crypto.randomUUID(),
              plane,
              fx,
              fy,
              voxel: snappedVoxel,
              label: msg.label as string,
              summary: msg.summary as string | undefined,
              severity,
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

  const connect = useCallback(() => {
    if (!RELAY_URL || !sessionId || wsRef.current) return;

    const wsBase = RELAY_URL.replace(/^http/, 'ws').replace(/\/$/, '');
    const ws = new WebSocket(`${wsBase}/ws?session=${sessionId}&role=app`);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      // Reset pong clock so we don't immediately trigger a timeout after
      // a fresh connect (the very first pong arrives ~20 s later).
      lastPongAt.current = Date.now();
      // Heartbeat every 20 s — keeps the Cloudflare Durable Object awake and
      // lets us detect a silently-dead connection: if no pong is received for
      // 50 s (≈ 2.5 missed cycles) we close and reconnect immediately instead
      // of waiting for a TCP timeout that may never arrive.
      heartbeatTimer.current = setInterval(() => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastPongAt.current > 50_000) {
          // Relay stopped responding — treat as a dead connection.
          ws.close(1000, 'pong-timeout');
          return;
        }
        ws.send(JSON.stringify({ type: 'ping' }));
      }, 20_000);
    });

    ws.addEventListener('message', (event: MessageEvent<string>) => {
      let msg: IncomingMessage;
      try {
        msg = JSON.parse(event.data) as IncomingMessage;
      } catch {
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
      if (msg.type === 'cmd') void handleCommand(msg);
    });

    ws.addEventListener('close', () => {
      wsRef.current = null;
      store.getState().setMcpConnected(false);
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
        connect();
      }, 5_000);
    });

    ws.addEventListener('error', () => {
      /* close fires next */
    });
  }, [sessionId, handleCommand, store, clearSessionIdle]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      clearSessionIdle();
      wsRef.current?.close(1000, 'unmount');
      wsRef.current = null;
    };
  }, [connect, clearSessionIdle]);

  // When the browser tab becomes visible again (user switches back), reconnect
  // immediately if the WebSocket is gone — browsers throttle timers in hidden
  // tabs, so the pong-timeout may fire late and the reconnect timer may not
  // have run yet.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
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
  }, [connect]);
}
