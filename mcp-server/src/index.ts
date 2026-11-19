#!/usr/bin/env node
/**
 * PrismaMRI MCP Server  v2
 *
 * Runs locally on the user's machine.  Claude Desktop communicates with it via
 * stdio.  The server listens on 127.0.0.1 and the PrismaMRI app connects to it
 * over a WebSocket; nothing leaves the machine.
 *
 * Optional env vars:
 *   PRISMAMRI_ALLOWED_ORIGINS – comma-separated extra origins allowed to open
 *                               the local WebSocket (forks / self-hosting).
 *                               See the origin allowlist below.
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
 *  Voxel analysis (numbers computed from the voxels, not read off a picture)
 *    survey_subject        size, shape, symmetry, declared body part / species
 *    roi_stats             mean, SD, percentiles, volume of a sphere or box
 *    line_profile          intensities along a line (edges, wall thickness)
 *    slice_curve           one number per slice — where along an axis it happens
 *    find_objects          separate objects: volume, position, long axis, shape
 *    axis_profile          follow one object: length, thickness, bends
 *    check_arrangement     does a row of objects (teeth, vertebrae) keep its order
 *    check_symmetry        what has no counterpart on the other side
 *    find_gaps             thin gaps in dense material (crack / fracture candidates)
 *    navigate_to_voxel     move the crosshair to a voxel
 *    capture_region        close-up at native resolution
 *    capture_montage       up to 20 slices on one sheet
 *
 *  Annotations (severity-coded findings, anchored in 2-D and 3-D)
 *    add_annotation        place a finding (severity + summary, returns id)
 *    remove_annotation     remove a specific finding by id
 *    list_annotations      list all current findings
 *    clear_annotations     remove all findings
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
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
import { DEFAULT_TIMEOUT_MS, TOOLS, TOOL_ACTIONS, type ToolName } from './tools.js';

// ── Config ───────────────────────────────────────────────────────────────────

// Ports tried in order when starting the local WS server.
const LOCAL_PORTS = [7389, 7390, 7391, 7392, 7393];

// ── Local WebSocket origin allowlist ─────────────────────────────────────────
// Binding to 127.0.0.1 is not an access control.  A WebSocket handshake is not
// subject to the same-origin policy and CORS headers do not constrain it, so
// without an Origin check *any* page the user happens to have open could reach
// this port and drive the viewer — including the capture_* tools, which read
// back the scan currently on screen.
//
// Browsers always attach an accurate `Origin` to a WS handshake and page JS
// cannot forge it, so an allowlist here is what actually keeps other sites out.
// Forks and self-hosted deployments add their own origin via
// PRISMAMRI_ALLOWED_ORIGINS (comma-separated) instead of editing this file.
const DEFAULT_ALLOWED_ORIGINS = ['https://abramovychyurii.github.io'];

const EXTRA_ALLOWED_ORIGINS = (process.env.PRISMAMRI_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter((o) => o.length > 0);

const ALLOWED_ORIGINS = new Set([...DEFAULT_ALLOWED_ORIGINS, ...EXTRA_ALLOWED_ORIGINS]);

/** Dev and preview servers on loopback, any port (vite 5173, preview 4173, …). */
const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Whether `origin` is allowed to open the local WebSocket.
 *
 * A missing Origin is rejected as well: every browser sets one, so a caller
 * without it is not a browser page, and the PWA is the only legitimate client.
 *
 * Loopback origins are allowed on any port because serving a page from
 * localhost already requires code execution on this machine — an attacker who
 * has that does not need this socket.
 */
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  const normalised = origin.replace(/\/$/, '');
  return ALLOWED_ORIGINS.has(normalised) || LOOPBACK_ORIGIN.test(normalised);
}

if (SKILL_INSTRUCTIONS && SKILL_INSTRUCTIONS.length > 0) {
  process.stderr.write(`[prismamri] Embedded radiology skill ready (${SKILL_INSTRUCTIONS.length} chars).\n`);
}

// ── Optional: install the skill for Claude Code ──────────────────────────────
// The skill already reaches Claude through the MCP instructions above (and the
// .dxt lists it for Claude Desktop). Claude Code can also list it as one of the
// user's own skills; that needs a copy in ~/.claude/skills, so it is off unless
// asked for:  PRISMAMRI_INSTALL_SKILL=1
//
// ~/.claude/skills is where Claude Code looks for a person's own skills and does
// not manage it. Nothing is written under ~/.claude/plugins: that folder belongs
// to Claude Code's marketplaces, so an update can wipe a copy there and a skill
// placed in an official marketplace's folder looks as if it were official.
// To remove it, delete ~/.claude/skills/prisma-mri-radiology.
// Best-effort: a failure logs a warning and never stops the server.
const SKILL_NAME = 'prisma-mri-radiology';

function installSkillToClaudeCode(): void {
  if (process.env.PRISMAMRI_INSTALL_SKILL !== '1') return;
  if (!SKILL_INSTRUCTIONS || SKILL_INSTRUCTIONS.length === 0) return;

  const skillDir = path.join(os.homedir(), '.claude', 'skills', SKILL_NAME);
  const skillPath = path.join(skillDir, 'SKILL.md');

  try {
    if (fs.existsSync(skillPath) && fs.readFileSync(skillPath, 'utf8') === SKILL_INSTRUCTIONS) {
      process.stderr.write(`[prismamri] Skill ${SKILL_NAME} is up to date.\n`);
      return;
    }
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillPath, SKILL_INSTRUCTIONS, 'utf8');
    process.stderr.write(`[prismamri] Installed skill ${SKILL_NAME} to ${skillPath}.\n`);
  } catch (err) {
    process.stderr.write(`[prismamri] Skill install failed (extension still works): ${(err as Error).message}\n`);
  }
}

installSkillToClaudeCode();

// ── Channel management ────────────────────────────────────────────────────────
// One channel: the MCP server listens on 127.0.0.1:PORT and the app connects to it.
// appConnected() = true while that socket is open.

type Pending = { resolve: (d: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
const pending = new Map<string, Pending>();

let localSocket: WebSocket | null = null;  // inbound conn from the app

function appConnected(): boolean {
  return localSocket?.readyState === WebSocket.OPEN;
}

function send(msg: object): void {
  if (localSocket?.readyState !== WebSocket.OPEN) throw new Error('No channel available');
  localSocket.send(JSON.stringify(msg));
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

/** Keys the message envelope sets itself; a command's own fields may not use them. */
const ENVELOPE_KEYS = ['type', 'id', 'action'] as const;

function command<T = unknown>(action: object, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  if (!appConnected()) throw new Error('PrismaMRI is not connected — open the app in your browser first.');
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (d: unknown) => void, reject, timer });
    send({ ...action, type: 'cmd', id });
  });
}

/**
 * Sends a tool's action to the app. The action name and the default wait come
 * from TOOL_ACTIONS (tools.ts), so a tool cannot name an action the table does
 * not know. `params` become top-level fields of the message; they may not use
 * the envelope's own keys, which would silently replace them (the reply would
 * then carry the wrong id and the request would only time out).
 */
function call<T = unknown>(tool: ToolName, params: object = {}, timeoutMs?: number): Promise<T> {
  const entry: { action: string; timeoutMs?: number } = TOOL_ACTIONS[tool];
  for (const key of ENVELOPE_KEYS) {
    if (key in params) {
      return Promise.reject(new Error(`Tool ${tool}: parameter "${key}" is reserved by the message envelope.`));
    }
  }
  return command<T>({ ...params, action: entry.action }, timeoutMs ?? entry.timeoutMs ?? DEFAULT_TIMEOUT_MS);
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
    // the upgrade — causing findLocalServer() to time out even though the
    // local MCP server is running.
    const httpServer = http.createServer((req, res) => {
      // Answer the PNA preflight so an allowed origin can upgrade, but only for
      // origins on the allowlist — echoing back `*` here would advertise this
      // port to every site the user has open.
      const origin = req.headers.origin;
      if (!isAllowedOrigin(origin)) {
        res.writeHead(403, { 'Content-Type': 'text/plain', Vary: 'Origin' });
        res.end('Forbidden origin');
        return;
      }
      res.writeHead(200, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        Vary: 'Origin',
      });
      res.end();
    });

    const srv = new WebSocketServer({
      server: httpServer,
      // Rejected before the socket exists, so a disallowed page never gets a
      // connection it could send commands on.
      verifyClient: ({ origin }, cb) => {
        if (isAllowedOrigin(origin)) {
          cb(true);
          return;
        }
        process.stderr.write(
          `[prismamri] Rejected WS upgrade from origin: ${origin ?? '(none)'}\n`,
        );
        cb(false, 403, 'Forbidden origin');
      },
    });

    // `ws` re-emits the HTTP server's errors here; without a listener a busy
    // port kills the process before the handler below can try the next one.
    srv.on('error', () => {});

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
      // Ping every 15 s.  Chrome freezes background tabs for 10–30+ s, so
      // 8 s was too short — a perfectly healthy connection was being killed
      // because the frozen tab couldn't reply in time.  Two consecutive
      // missed pongs (= up to 30 s of JS freeze tolerance) are required
      // before the socket is terminated.
      const PING_INTERVAL_MS = 15_000;

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
        // Send a ping every PING_INTERVAL_MS.  Require TWO consecutive missed
        // pongs before terminating — this tolerates Chrome's background-tab JS
        // freeze (which can last 10–30 s) without killing healthy connections.
        // A truly dead socket will be detected after at most 2 × PING_INTERVAL_MS.
        let pongReceived = true; // treat first interval as if pong was received
        let missedPongs = 0;
        const hb = setInterval(() => {
          if (!pongReceived) {
            missedPongs++;
            if (missedPongs >= 2) {
              process.stderr.write('[prismamri] Two consecutive pong timeouts — terminating stale socket.\n');
              socket.terminate(); // forceful close, triggers the 'close' event
              return;
            }
            process.stderr.write(`[prismamri] Pong timeout #${missedPongs} — giving one more interval.\n`);
          } else {
            missedPongs = 0;
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

// ── MCP content helpers ───────────────────────────────────────────────────────

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

// Every capture the app returns is JPEG (canvas-utils / ThreePreview.captureJpeg).
const img = (data: string): ContentBlock => ({ type: 'image', data, mimeType: 'image/jpeg' });
const txt = (text: string): ContentBlock => ({ type: 'text', text });
const jsonBlock = (value: unknown): ContentBlock =>
  txt('```json\n' + JSON.stringify(value) + '\n```');

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
      const state = await call<ViewerState>('get_viewer_state');
      return { content: [txt(JSON.stringify(state, null, 2))] };
    }

    // ── get_volume_overview ──────────────────────────────────────────────────
    case 'get_volume_overview': {
      const result = await call<OverviewResult>('get_volume_overview');
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
      await call('navigate_to_slice', { plane, slice });
      return { content: [txt(`Navigated to ${plane} slice ${slice}.`)] };
    }

    // ── step_slice ───────────────────────────────────────────────────────────
    case 'step_slice': {
      const { plane, steps } = args as { plane: string; steps: number };
      const result = await call<{ slice: number; total: number }>('step_slice', { plane, steps });
      return { content: [txt(`Stepped to ${plane} slice ${result.slice} / ${result.total}.`)] };
    }

    // ── navigate_to_center ───────────────────────────────────────────────────
    case 'navigate_to_center': {
      const result = await call<{ sliceIndices: { coronal: number; sagittal: number; axial: number } }>('navigate_to_center');
      return { content: [txt(`Moved to centre — coronal ${result.sliceIndices.coronal}, sagittal ${result.sliceIndices.sagittal}, axial ${result.sliceIndices.axial}.`)] };
    }

    // ── set_window_level ─────────────────────────────────────────────────────
    case 'set_window_level': {
      const { window: w, level: l } = args as { window: number; level: number };
      await call('set_window_level', { window: w, level: l });
      return { content: [txt(`Window/level set to ${w} / ${l}.`)] };
    }

    // ── apply_wl_preset ──────────────────────────────────────────────────────
    case 'apply_wl_preset': {
      const { preset } = args as { preset: string };
      const result = await call<{ window: number; level: number }>('apply_wl_preset', { preset });
      return { content: [txt(`Preset "${preset}" applied — window ${Math.round(result.window)}, level ${Math.round(result.level)}.`)] };
    }

    // ── set_render_preset ────────────────────────────────────────────────────
    case 'set_render_preset': {
      const { preset } = args as { preset: string };
      await call('set_render_preset', { preset });
      return { content: [txt(`3-D preset changed to "${preset}".`)] };
    }

    // ── set_slab_mm ──────────────────────────────────────────────────────────
    case 'set_slab_mm': {
      const { slab_mm } = args as { slab_mm: number };
      const { slabMm } = await call<{ slabMm: number }>('set_slab_mm', { slab_mm });
      return {
        content: [
          txt(slabMm === 0 ? 'Slab MIP disabled.' : `Slab MIP set to ${slabMm} mm.`),
        ],
      };
    }

    // ── capture_slice ────────────────────────────────────────────────────────
    case 'capture_slice': {
      const { plane, slab_mm } = args as { plane: string; slab_mm?: number };
      const { imageData } = await call<{ imageData: string }>('capture_slice', { plane, slab_mm: slab_mm ?? 0 });
      const label = slab_mm ? `${plane} slice (${slab_mm} mm slab MIP):` : `${plane} slice:`;
      return { content: [txt(label), img(imageData)] };
    }

    // ── capture_3d ───────────────────────────────────────────────────────────
    case 'capture_3d': {
      const { view = 'current' } = args as { view?: string };
      if (view === 'all') {
        const r = await call<{ coronal: string; sagittal: string; axial: string }>(
          'capture_3d',
          { view },
          40_000, // three renders in a row
        );
        return {
          content: [
            txt('3-D render, coronal view (frontal):'),   img(r.coronal),
            txt('3-D render, sagittal view (lateral):'),  img(r.sagittal),
            txt('3-D render, axial view (top-down):'),    img(r.axial),
          ],
        };
      }
      const { imageData } = await call<{ imageData: string }>('capture_3d', { view });
      return {
        content: [txt(view === 'current' ? '3-D render:' : `3-D render, ${view} view:`), img(imageData)],
      };
    }

    // ── capture_all_planes ───────────────────────────────────────────────────
    case 'capture_all_planes': {
      const result = await call<{ coronal: string; sagittal: string; axial: string }>('capture_all_planes');
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
      const result = await call<GridResult>('capture_overview_grid', { plane, count: clamped });
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
      const { id } = await call<{ id: string }>('add_annotation', {
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
      await call('remove_annotation', { annotationId: id });
      return { content: [txt(`Annotation ${id} removed.`)] };
    }

    // ── list_annotations ─────────────────────────────────────────────────────
    case 'list_annotations': {
      const result = await call<{ annotations: unknown[]; count: number }>('list_annotations');
      return {
        content: [
          txt(`${result.count} finding(s):\n\`\`\`json\n${JSON.stringify(result.annotations, null, 2)}\n\`\`\``),
        ],
      };
    }

    // ── clear_annotations ────────────────────────────────────────────────────
    case 'clear_annotations': {
      await call('clear_annotations');
      return { content: [txt('All annotations cleared.')] };
    }

    // ── set_measurement ──────────────────────────────────────────────────────
    case 'set_measurement': {
      const { from, to } = args as {
        from: { x: number; y: number; z: number };
        to: { x: number; y: number; z: number };
      };
      const result = await call<{
        from: { x: number; y: number; z: number };
        to: { x: number; y: number; z: number };
        distanceMm: number | null;
      }>('set_measurement', { from, to });
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
      const result = await call<{
        hasMeasurement: boolean;
        from: { x: number; y: number; z: number } | null;
        to: { x: number; y: number; z: number } | null;
        distanceMm: number | null;
      }>('get_measurement');
      if (!result.hasMeasurement) {
        return { content: [txt('No measurement is currently set.')] };
      }
      return {
        content: [txt(`Current measurement:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``)],
      };
    }

    // ── clear_measurement ────────────────────────────────────────────────────
    case 'clear_measurement': {
      await call('clear_measurement');
      return { content: [txt('Measurement cleared.')] };
    }

    // ── Voxel analysis ───────────────────────────────────────────────────────
    case 'survey_subject':
    case 'roi_stats':
    case 'line_profile':
    case 'slice_curve':
    case 'find_objects':
    case 'axis_profile':
    case 'check_arrangement':
    case 'check_symmetry':
    case 'find_gaps':
      return { content: [jsonBlock(await call(name, args))] };

    case 'list_series':
    case 'switch_series':
      return { content: [jsonBlock(await call(name, args))] };

    case 'navigate_to_voxel': {
      const { cursor } = await call<{ cursor: { x: number; y: number; z: number } }>('navigate_to_voxel', args);
      return { content: [txt(`Crosshair at voxel (${cursor.x}, ${cursor.y}, ${cursor.z}).`)] };
    }

    case 'capture_region':
    case 'capture_montage': {
      const { imageData, ...info } = await call<{ imageData: string } & Record<string, unknown>>(name, args);
      return { content: [jsonBlock(info), img(imageData)] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── MCP server wiring ─────────────────────────────────────────────────────────

const server = new Server(
  { name: 'prismamri', version: '2.2.0' },
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

startLocalServer();
(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[prismamri] MCP server v2 ready.\n');
})().catch((err: Error) => {
  process.stderr.write(`[prismamri] Fatal: ${err.message}\n`);
  process.exit(1);
});
