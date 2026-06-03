#!/usr/bin/env node
/**
 * PrismaMRI MCP Server  v2
 *
 * Runs locally on the user's machine.  Claude Desktop communicates with it via
 * stdio.  The server keeps a WebSocket connection to the Cloudflare relay which
 * forwards every message to the PrismaMRI app (and vice-versa).
 *
 * Required env vars:
 *   PRISMAMRI_SESSION   – UUID shown in the app's "AI Agent" panel
 *   PRISMAMRI_RELAY_URL – https://prismamri-relay.<account>.workers.dev
 *
 * ── Tools ────────────────────────────────────────────────────────────────────
 *  Overview / state
 *    get_viewer_state      current cursor, dims, W/L, preset
 *    get_volume_overview   rich metadata + 3 centre-slice captures in one call
 *
 *  Navigation
 *    navigate_to_slice     absolute slice index on a plane
 *    step_slice            relative ±N slices on a plane
 *    navigate_to_center    jump to the anatomical centre of the volume
 *
 *  Display
 *    set_window_level      manual W/L
 *    apply_wl_preset       named preset (t1/t2/flair/bone/soft_tissue/full_range)
 *    set_render_preset     3-D mode (mip/tissue/bone)
 *
 *  Capture
 *    capture_slice         single-plane PNG (optional slab_mm MIP)
 *    capture_all_planes    coronal + sagittal + axial at current position
 *    capture_overview_grid N evenly-spaced slices across one plane
 *    capture_3d            screenshot of the 3-D render
 *
 *  Annotations (severity-coded findings, anchored in 2-D and 3-D)
 *    add_annotation        place a finding (severity + summary, returns id)
 *    remove_annotation     remove a specific finding by id
 *    list_annotations      list all current findings
 *    clear_annotations     remove all findings
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';
// Radiology-analysis skill, inlined at build time by esbuild's text loader
// (--loader:.md=text). Delivered to Claude in two complementary ways:
//   1. Via the MCP `instructions` field on `initialize` — invisible but
//      always-on guidance for the current session.
//   2. Copied to the platform-specific Claude Desktop skills directory on
//      first startup — appears in the Skills UI as `prisma-mri-radiology`.
// Type comes from mcp-server/src/markdown.d.ts.
import SKILL_INSTRUCTIONS from '../skill/SKILL.md';

// ── Config ───────────────────────────────────────────────────────────────────

const SESSION   = process.env.PRISMAMRI_SESSION;
const RELAY_URL = process.env.PRISMAMRI_RELAY_URL;

// Relay is optional — if both vars are set, the server bridges to the hosted web app.
// When running without relay the server accepts direct local connections from the PWA.
const WS_URL =
  SESSION && RELAY_URL
    ? `${RELAY_URL.replace(/^http/, 'ws').replace(/\/$/, '')}/ws?session=${SESSION}&role=mcp`
    : null;

if (!WS_URL) {
  process.stderr.write('[prismamri] Relay not configured — running in local-only mode.\n');
}

// Ports tried in order when starting the local WS server.
const LOCAL_PORTS = [7389, 7390, 7391, 7392, 7393];

if (SKILL_INSTRUCTIONS && SKILL_INSTRUCTIONS.length > 0) {
  process.stderr.write(`[prismamri] Embedded radiology skill ready (${SKILL_INSTRUCTIONS.length} chars).\n`);
}

// ── Install skill into Claude Code's plugin system ───────────────────────────
// Best-effort: writes the bundled SKILL.md into ~/.claude/plugins so the skill
// appears in Claude Code's skills UI panel (not just as invisible MCP context).
// Wrapped in try/catch — any failure logs a warning but never crashes the server.
// Idempotent via .installed-version marker at the plugin root; re-runs on bump.
// The marketplace update may wipe the plugin dir — the server re-installs on
// next startup automatically (version file is gone → fresh install).
//
// Skip by setting PRISMAMRI_SKIP_SKILL_INSTALL=1.
const SKILL_NAME = 'prisma-mri-radiology';
const SKILL_VERSION = '1.1.0'; // bump when SKILL.md changes substantively

function claudeCodeDir(): string {
  return path.join(os.homedir(), '.claude');
}

const PLUGIN_README = `# PrismaMRI AI Agent

Radiology-analysis skill for the PrismaMRI DICOM viewer.

Installed automatically by the PrismaMRI MCP server on first startup.
To uninstall, delete this directory and set PRISMAMRI_SKIP_SKILL_INSTALL=1.
`;

function installSkillToClaudeCode(): void {
  if (process.env.PRISMAMRI_SKIP_SKILL_INSTALL === '1') {
    process.stderr.write('[prismamri] Skill install skipped (PRISMAMRI_SKIP_SKILL_INSTALL=1).\n');
    return;
  }
  if (!SKILL_INSTRUCTIONS || SKILL_INSTRUCTIONS.length === 0) return;

  // Target: ~/.claude/plugins/marketplaces/claude-plugins-official/plugins/prismamri/
  // This is the location Claude Code reads for the skills UI panel.
  const pluginDir = path.join(
    claudeCodeDir(),
    'plugins', 'marketplaces', 'claude-plugins-official', 'plugins', 'prismamri',
  );
  const skillDir = path.join(pluginDir, 'skills', SKILL_NAME);
  const skillPath = path.join(skillDir, 'SKILL.md');
  const versionPath = path.join(pluginDir, '.installed-version');

  try {
    if (fs.existsSync(versionPath)) {
      const installed = fs.readFileSync(versionPath, 'utf8').trim();
      if (installed === SKILL_VERSION) {
        process.stderr.write(`[prismamri] Skill ${SKILL_NAME} v${SKILL_VERSION} already installed.\n`);
        return;
      }
    }
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillPath, SKILL_INSTRUCTIONS, 'utf8');
    fs.writeFileSync(path.join(pluginDir, 'README.md'), PLUGIN_README, 'utf8');
    fs.writeFileSync(versionPath, SKILL_VERSION, 'utf8');
    process.stderr.write(`[prismamri] Installed skill ${SKILL_NAME} v${SKILL_VERSION} to ${skillPath}.\n`);
  } catch (err) {
    process.stderr.write(`[prismamri] Skill install failed (extension still works): ${(err as Error).message}\n`);
  }
}

installSkillToClaudeCode();

// ── Channel management ────────────────────────────────────────────────────────
// Two independent channels can be active simultaneously:
//   • relay  – MCP server connects OUT to Cloudflare  (for the hosted web app)
//   • local  – MCP server listens on 127.0.0.1:PORT   (for the installed PWA)
//
// send() prefers the local socket (zero relay latency); falls back to relay.
// appConnected() = true when EITHER channel has a live app connection.

type Pending = { resolve: (d: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
const pending = new Map<string, Pending>();

let relayWs: WebSocket | null = null;      // outbound conn to Cloudflare relay
let localSocket: WebSocket | null = null;  // inbound conn from PWA (local mode)
let relayAppOnline = false;                // relay told us the web app is open

function appConnected(): boolean {
  return (localSocket?.readyState === WebSocket.OPEN) || relayAppOnline;
}

function send(msg: object): void {
  const json = JSON.stringify(msg);
  // Prefer local (no relay round-trip).
  if (localSocket?.readyState === WebSocket.OPEN) { localSocket.send(json); return; }
  if (relayWs?.readyState   === WebSocket.OPEN)  { relayWs.send(json);     return; }
  throw new Error('No channel available');
}

/** Resolve or reject the pending request that matches msg.id. */
function handleResult(msg: Record<string, unknown>): void {
  const req = pending.get(msg.id as string);
  if (!req) return;
  pending.delete(msg.id as string);
  clearTimeout(req.timer);
  msg.ok
    ? req.resolve(msg.data ?? null)
    : req.reject(new Error((msg.error as string) ?? 'App error'));
}

function command<T = unknown>(action: object, timeoutMs = 20_000): Promise<T> {
  if (!appConnected()) throw new Error('PrismaMRI is not connected — open the app in your browser first.');
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (d: unknown) => void, reject, timer });
    send({ type: 'cmd', id, ...action });
  });
}

// ── Local WebSocket server ────────────────────────────────────────────────────
// Tries LOCAL_PORTS in order and binds to the first available one.
// The installed PWA connects to ws://127.0.0.1:<port> directly.

function startLocalServer(): void {
  let portIndex = 0;

  const tryNext = (): void => {
    if (portIndex >= LOCAL_PORTS.length) {
      process.stderr.write('[prismamri] All local ports busy — local-direct mode unavailable.\n');
      return;
    }
    const port = LOCAL_PORTS[portIndex++];

    // Wrap in an explicit HTTP server so we can respond to Private Network
    // Access preflight requests.  Chrome (Chromium 104+) sends an OPTIONS
    // request with `Access-Control-Request-Private-Network: true` before
    // upgrading to WebSocket when the caller origin is a public HTTPS site
    // (e.g. GitHub Pages hosted PWA) connecting to 127.0.0.1.  A bare
    // WebSocketServer never answers those HTTP requests, so Chrome blocks
    // the upgrade — causing findLocalServer() to time-out and fall back to
    // the Cloudflare relay even when the local MCP server is running.
    const httpServer = http.createServer((_req, res) => {
      // Respond to all HTTP (non-upgrade) requests with the PNA header so
      // the preflight succeeds.  The only callers are the same-machine PWA.
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      });
      res.end();
    });

    const srv = new WebSocketServer({ server: httpServer });

    httpServer.once('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE') {
        process.stderr.write(`[prismamri] Port ${port} busy, trying ${LOCAL_PORTS[portIndex] ?? 'none'}…\n`);
        srv.close();
        tryNext();
      } else {
        process.stderr.write(`[prismamri] Local server error: ${e.message}\n`);
      }
    });

    httpServer.listen(port, '127.0.0.1', () => {
      process.stderr.write(`[prismamri] Local WS ready — ws://127.0.0.1:${port}\n`);

      let lastAcceptMs = 0;
      // Cooldown raised to 3 s — gives the client's 1-second reconnect delay
      // enough headroom so a legitimate fast reconnect isn't rejected as
      // a competing client, which was causing spurious 1008/backoff cycles.
      const ACCEPT_COOLDOWN_MS = 3_000;
      // Ping every 8 s and terminate if no pong arrives within one interval.
      // 20 s was too long: a silently-dead socket would block new connections
      // for up to 20 s and the server never learned the client was gone.
      const PING_INTERVAL_MS = 8_000;

      srv.on('connection', (socket: WebSocket) => {
        const now = Date.now();
        // Reject newcomers while an existing healthy connection is active AND
        // was accepted within the cooldown window.  After the cooldown (or when
        // the live socket is gone) a new connection is accepted normally.
        if (
          localSocket?.readyState === WebSocket.OPEN &&
          now - lastAcceptMs < ACCEPT_COOLDOWN_MS
        ) {
          socket.close(1008, 'already connected');
          return;
        }

        // Replace any stale or idle socket.
        localSocket?.close(1001, 'superseded by new connection');
        localSocket = socket;
        lastAcceptMs = now;
        process.stderr.write('[prismamri] PWA connected (local).\n');

        // ── Keepalive with pong watchdog ───────────────────────────────────
        // Send a ping every PING_INTERVAL_MS.  If the client does not reply
        // within the next interval the socket is terminated so a new
        // connection can be established immediately (instead of waiting for
        // the OS TCP stack to report the drop, which can take minutes).
        let pongReceived = true; // treat first interval as if pong was received
        const hb = setInterval(() => {
          if (!pongReceived) {
            process.stderr.write('[prismamri] Pong timeout — terminating stale socket.\n');
            socket.terminate(); // forceful close, triggers the 'close' event
            return;
          }
          pongReceived = false;
          if (socket.readyState === WebSocket.OPEN) socket.send('{"type":"ping"}');
        }, PING_INTERVAL_MS);

        socket.on('message', (raw: WebSocket.RawData) => {
          let msg: Record<string, unknown>;
          try { msg = JSON.parse(raw.toString()) as Record<string, unknown>; } catch { return; }
          if (msg.type === 'pong') { pongReceived = true; return; }
          if (msg.type === 'result') handleResult(msg);
        });

        socket.on('close', () => {
          clearInterval(hb);
          if (localSocket === socket) {
            localSocket = null;
            process.stderr.write('[prismamri] PWA disconnected (local).\n');
          }
        });

        socket.on('error', (e: Error) =>
          process.stderr.write(`[prismamri] Local socket error: ${e.message}\n`),
        );
      });
    });
  };

  tryNext();
}

// ── Relay WebSocket ───────────────────────────────────────────────────────────

let relayHeartbeat: ReturnType<typeof setInterval> | null = null;

function connectRelay(): void {
  if (!WS_URL) return;
  relayWs = new WebSocket(WS_URL);

  relayWs.on('open', () => {
    process.stderr.write('[prismamri] Relay connected.\n');
    // Ping every 20 s — prevents Cloudflare Durable Object hibernation.
    relayHeartbeat = setInterval(() => {
      if (relayWs?.readyState === WebSocket.OPEN) relayWs.send('{"type":"ping"}');
    }, 20_000);
  });

  relayWs.on('message', (raw: WebSocket.RawData) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw.toString()) as Record<string, unknown>; } catch { return; }
    const type = msg.type as string;
    if (type === 'app_connected')    { relayAppOnline = true;  process.stderr.write('[prismamri] Web app online (relay).\n');  return; }
    if (type === 'app_disconnected') { relayAppOnline = false; process.stderr.write('[prismamri] Web app offline (relay).\n'); return; }
    if (type === 'result') handleResult(msg);
  });

  relayWs.on('close', () => {
    relayAppOnline = false;
    relayWs = null;
    if (relayHeartbeat) { clearInterval(relayHeartbeat); relayHeartbeat = null; }
    process.stderr.write('[prismamri] Relay disconnected — reconnecting in 5 s…\n');
    for (const [id, req] of pending) {
      clearTimeout(req.timer);
      req.reject(new Error('Relay closed'));
      pending.delete(id);
    }
    setTimeout(connectRelay, 5_000);
  });

  relayWs.on('error', (e: Error) => process.stderr.write(`[prismamri] Relay error: ${e.message}\n`));
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const PLANES = { type: 'string', enum: ['coronal', 'sagittal', 'axial'] } as const;

const TOOLS: Tool[] = [
  // ── Overview / state ───────────────────────────────────────────────────────
  {
    name: 'get_viewer_state',
    description: 'Return the current viewer state: volume dims, voxel spacing, crosshair ' +
      'position, slice indices/totals for every plane, window/level and 3-D render preset.',
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
      'Capture a PNG screenshot of the 3-D volume render exactly as shown — including the ' +
      'current render preset, cursor planes, clipping and any AI finding markers. Useful ' +
      'for conveying the overall spatial picture. Set the render preset first if needed.',
    inputSchema: { type: 'object', properties: {}, required: [] },
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

  // ── Annotations ────────────────────────────────────────────────────────────
  {
    name: 'add_annotation',
    description:
      'Place a finding marker on the volume so the user can see it on the 2-D panels AND ' +
      'the 3-D model. The marker is anchored to the slice you place it on and to a 3-D ' +
      'point. Capture the relevant slice first to read the coordinates. Returns the id.',
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
      'position and summary. Use to review or before removing a specific one.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'clear_annotations',
    description: 'Remove every AI finding marker from the viewer.',
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

// ── MCP content helpers ───────────────────────────────────────────────────────

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

const img = (data: string): ContentBlock => ({ type: 'image', data, mimeType: 'image/png' });
const txt = (text: string): ContentBlock => ({ type: 'text', text });

// ── Types returned by the app ─────────────────────────────────────────────────

type ViewerState = {
  volumeLoaded: boolean;
  dims: [number, number, number] | null;
  spacing: [number, number, number] | null;
  cursor: { x: number; y: number; z: number } | null;
  sliceIndices: { coronal: number; sagittal: number; axial: number } | null;
  sliceTotals:  { coronal: number; sagittal: number; axial: number } | null;
  wl: { window: number; level: number };
  preset: string;
};

type OverviewResult = {
  meta: {
    dims: [number, number, number];
    spacing: [number, number, number];
    modality?: string;
    scanner?: string;
    protocol?: string;
    scalarMin: number;
    scalarMax: number;
    formatId: string;
  };
  cursor: { x: number; y: number; z: number };
  sliceIndices: { coronal: number; sagittal: number; axial: number };
  images: { coronal: string | null; sagittal: string | null; axial: string | null };
};

type GridResult = { images: string[]; indices: number[]; total: number };

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: ContentBlock[] }> {
  switch (name) {

    // ── get_viewer_state ─────────────────────────────────────────────────────
    case 'get_viewer_state': {
      const state = await command<ViewerState>({ action: 'get_state' });
      return { content: [txt(JSON.stringify(state, null, 2))] };
    }

    // ── get_volume_overview ──────────────────────────────────────────────────
    case 'get_volume_overview': {
      const result = await command<OverviewResult>({ action: 'overview' }, 30_000);
      const content: ContentBlock[] = [
        txt('## Volume metadata\n```json\n' + JSON.stringify(result.meta, null, 2) + '\n```'),
        txt(`Centre slices — coronal ${result.sliceIndices.coronal} / sagittal ${result.sliceIndices.sagittal} / axial ${result.sliceIndices.axial}`),
      ];
      for (const plane of ['coronal', 'sagittal', 'axial'] as const) {
        const data = result.images[plane];
        content.push(txt(`### ${plane.charAt(0).toUpperCase() + plane.slice(1)}`));
        if (data) content.push(img(data)); else content.push(txt('(canvas not available)'));
      }
      return { content };
    }

    // ── navigate_to_slice ────────────────────────────────────────────────────
    case 'navigate_to_slice': {
      const { plane, slice } = args as { plane: string; slice: number };
      await command({ action: 'navigate', plane, slice });
      return { content: [txt(`Navigated to ${plane} slice ${slice}.`)] };
    }

    // ── step_slice ───────────────────────────────────────────────────────────
    case 'step_slice': {
      const { plane, steps } = args as { plane: string; steps: number };
      const result = await command<{ slice: number; total: number }>({ action: 'step', plane, steps });
      return { content: [txt(`Stepped to ${plane} slice ${result.slice} / ${result.total}.`)] };
    }

    // ── navigate_to_center ───────────────────────────────────────────────────
    case 'navigate_to_center': {
      const result = await command<{ sliceIndices: { coronal: number; sagittal: number; axial: number } }>({ action: 'navigate_center' });
      return { content: [txt(`Moved to centre — coronal ${result.sliceIndices.coronal}, sagittal ${result.sliceIndices.sagittal}, axial ${result.sliceIndices.axial}.`)] };
    }

    // ── set_window_level ─────────────────────────────────────────────────────
    case 'set_window_level': {
      const { window: w, level: l } = args as { window: number; level: number };
      await command({ action: 'set_wl', window: w, level: l });
      return { content: [txt(`Window/level set to ${w} / ${l}.`)] };
    }

    // ── apply_wl_preset ──────────────────────────────────────────────────────
    case 'apply_wl_preset': {
      const { preset } = args as { preset: string };
      const result = await command<{ window: number; level: number }>({ action: 'apply_wl_preset', preset });
      return { content: [txt(`Preset "${preset}" applied — window ${Math.round(result.window)}, level ${Math.round(result.level)}.`)] };
    }

    // ── set_render_preset ────────────────────────────────────────────────────
    case 'set_render_preset': {
      const { preset } = args as { preset: string };
      await command({ action: 'set_preset', preset });
      return { content: [txt(`3-D preset changed to "${preset}".`)] };
    }

    // ── set_slab_mm ──────────────────────────────────────────────────────────
    case 'set_slab_mm': {
      const { slab_mm } = args as { slab_mm: number };
      const { slabMm } = await command<{ slabMm: number }>({ action: 'set_slab_mm', slab_mm });
      return {
        content: [
          txt(slabMm === 0 ? 'Slab MIP disabled.' : `Slab MIP set to ${slabMm} mm.`),
        ],
      };
    }

    // ── capture_slice ────────────────────────────────────────────────────────
    case 'capture_slice': {
      const { plane, slab_mm } = args as { plane: string; slab_mm?: number };
      const { imageData } = await command<{ imageData: string }>(
        { action: 'capture_slice', plane, slab_mm: slab_mm ?? 0 },
        20_000,
      );
      const label = slab_mm ? `${plane} slice (${slab_mm} mm slab MIP):` : `${plane} slice:`;
      return { content: [txt(label), img(imageData)] };
    }

    // ── capture_3d ───────────────────────────────────────────────────────────
    case 'capture_3d': {
      const { imageData } = await command<{ imageData: string }>({ action: 'capture_3d' }, 25_000);
      return { content: [txt('3-D render:'), img(imageData)] };
    }

    // ── capture_all_planes ───────────────────────────────────────────────────
    case 'capture_all_planes': {
      const result = await command<{ coronal: string; sagittal: string; axial: string }>({ action: 'capture_all' }, 30_000);
      return {
        content: [
          txt('Coronal:'),   img(result.coronal),
          txt('Sagittal:'),  img(result.sagittal),
          txt('Axial:'),     img(result.axial),
        ],
      };
    }

    // ── capture_overview_grid ────────────────────────────────────────────────
    case 'capture_overview_grid': {
      const { plane, count = 5 } = args as { plane: string; count?: number };
      const clamped = Math.min(8, Math.max(2, count));
      const result = await command<GridResult>({ action: 'overview_grid', plane, count: clamped }, 90_000);
      const content: ContentBlock[] = [txt(`${plane} overview — ${result.images.length} slices sampled:`)];
      result.images.forEach((data, i) => {
        content.push(txt(`Slice ${result.indices[i]} / ${result.total}`));
        content.push(img(data));
      });
      return { content };
    }

    // ── add_annotation ───────────────────────────────────────────────────────
    case 'add_annotation': {
      const { plane, fx, fy, label, severity = 'serious', summary, confidence, size_mm } = args as {
        plane: string;
        fx: number;
        fy: number;
        label: string;
        severity?: string;
        summary?: string;
        confidence?: number;
        size_mm?: number;
      };
      const { id } = await command<{ id: string }>({
        action: 'add_annotation',
        plane,
        fx,
        fy,
        label,
        severity,
        summary,
        confidence,
        size_mm,
      });
      return {
        content: [
          txt(
            `[${severity}] "${label}" placed on ${plane} at (${fx.toFixed(2)}, ${fy.toFixed(2)}). id: ${id}`,
          ),
        ],
      };
    }

    // ── remove_annotation ────────────────────────────────────────────────────
    case 'remove_annotation': {
      const { id } = args as { id: string };
      await command({ action: 'remove_annotation', id });
      return { content: [txt(`Annotation ${id} removed.`)] };
    }

    // ── list_annotations ─────────────────────────────────────────────────────
    case 'list_annotations': {
      const result = await command<{ annotations: unknown[]; count: number }>({
        action: 'list_annotations',
      });
      return {
        content: [
          txt(`${result.count} finding(s):\n\`\`\`json\n${JSON.stringify(result.annotations, null, 2)}\n\`\`\``),
        ],
      };
    }

    // ── clear_annotations ────────────────────────────────────────────────────
    case 'clear_annotations': {
      await command({ action: 'clear_annotations' });
      return { content: [txt('All annotations cleared.')] };
    }

    // ── set_measurement ──────────────────────────────────────────────────────
    case 'set_measurement': {
      const { from, to } = args as {
        from: { x: number; y: number; z: number };
        to: { x: number; y: number; z: number };
      };
      const result = await command<{
        from: { x: number; y: number; z: number };
        to: { x: number; y: number; z: number };
        distanceMm: number | null;
      }>({ action: 'set_measurement', from, to });
      const dist =
        result.distanceMm !== null ? `${result.distanceMm.toFixed(2)} mm` : 'distance unavailable';
      return {
        content: [
          txt(
            `Measurement placed: (${from.x}, ${from.y}, ${from.z}) → (${to.x}, ${to.y}, ${to.z}) — ${dist}.`,
          ),
        ],
      };
    }

    // ── get_measurement ──────────────────────────────────────────────────────
    case 'get_measurement': {
      const result = await command<{
        hasMeasurement: boolean;
        from: { x: number; y: number; z: number } | null;
        to: { x: number; y: number; z: number } | null;
        distanceMm: number | null;
      }>({ action: 'get_measurement' });
      if (!result.hasMeasurement) {
        return { content: [txt('No measurement is currently set.')] };
      }
      return {
        content: [txt(`Current measurement:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``)],
      };
    }

    // ── clear_measurement ────────────────────────────────────────────────────
    case 'clear_measurement': {
      await command({ action: 'clear_measurement' });
      return { content: [txt('Measurement cleared.')] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── MCP server wiring ─────────────────────────────────────────────────────────

const server = new Server(
  { name: 'prismamri', version: '2.1.0' },
  {
    capabilities: { tools: {} },
    // Skill text is delivered to Claude during the MCP `initialize` handshake.
    ...(SKILL_INSTRUCTIONS ? { instructions: SKILL_INSTRUCTIONS } : {}),
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    return await handleTool(name, args as Record<string, unknown>);
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true };
  }
});

// Start local server unconditionally; connect to relay only when configured.
startLocalServer();
if (WS_URL) connectRelay();
(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[prismamri] MCP server v2 ready.\n');
})().catch((err: Error) => {
  process.stderr.write(`[prismamri] Fatal: ${err.message}\n`);
  process.exit(1);
});
