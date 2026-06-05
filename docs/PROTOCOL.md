# PrismaMRI WebSocket Protocol

This document specifies the local WebSocket protocol that the PrismaMRI browser app speaks to its companion process. The bundled `prismamri.dxt` MCP server uses this protocol, but it is **not specific to MCP** — any local process can drive the viewer over this socket: a CLI, a Python notebook bridge, a custom MCP server pointed at a different LLM, an integration test harness, etc.

The protocol is intentionally tiny: one JSON message per line, request/response with correlation ids. There is no auth — the socket only listens on `127.0.0.1`, so anything that can open a loopback connection can drive the viewer (this is the same trust boundary as any other developer tool running on your machine).

> **Stability:** the protocol is unversioned and may change between releases. The MCP server ships in lockstep with the browser app, so users always get a matching pair. If you build a third-party client, pin to a specific PrismaMRI version.

## Contents

- [Transport & discovery](#transport--discovery)
- [Message framing](#message-framing)
- [Connection lifecycle](#connection-lifecycle)
- [Coordinate systems](#coordinate-systems)
- [Commands](#commands)
  - [State](#state)
  - [Navigation](#navigation)
  - [Display](#display)
  - [Capture](#capture)
  - [Annotations](#annotations)
  - [Measurement](#measurement)
- [Errors](#errors)
- [Minimal client examples](#minimal-client-examples)

## Transport & discovery

- **Transport:** plain WebSocket (no TLS) on `127.0.0.1`.
- **Role:** the *companion process* runs the WebSocket **server**; the *browser app* is the **client** that connects out to it. (This is reversed from what most people expect — it's done this way so the browser PWA, which cannot bind a port, is always the initiator.)
- **Ports tried, in order:** `7389, 7390, 7391, 7392, 7393`. Pick the first free one.
- **PNA preflight:** Chromium-based browsers send a [Private Network Access](https://developer.chrome.com/blog/private-network-access-preflight) preflight before upgrading to WebSocket from a public origin (e.g. the GitHub-Pages-hosted PWA). Your server **must** respond to plain HTTP requests on the same port with:
  ```
  HTTP/1.1 200 OK
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Private-Network: true
  Access-Control-Allow-Headers: *
  Access-Control-Allow-Methods: GET, OPTIONS
  ```
  Otherwise Chrome silently blocks the upgrade. See [`mcp-server/src/index.ts`](../mcp-server/src/index.ts) for a reference implementation.
- **Browser discovery:** the PWA scans all five ports in parallel with a 300 ms probe timeout, caches the winning port in `localStorage` (`prismamri-last-local-port`), and tries the cached port first on subsequent loads.
- **One client per app:** only one browser tab holds the socket at a time (enforced via [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) — `prismamri-mcp-bridge`). If the leader tab closes, the next tab takes over automatically. Your server may also see brief connection storms during tab handoff — see [Connection lifecycle](#connection-lifecycle) for the recommended cooldown.

## Message framing

Every WebSocket frame is a single JSON object, UTF-8 encoded. No length prefix, no framing layer on top of WebSocket itself. There are exactly three message kinds.

### `cmd` (server → browser)

A request from your companion process to the browser app.

```json
{ "type": "cmd", "id": "<uuid>", "action": "<action-name>", "...params": "..." }
```

- `id` — opaque correlation id. Echoed back in the `result`. Convention: UUID v4.
- `action` — one of the names listed in [Commands](#commands).
- Action-specific parameters are siblings of `action`, not nested.

### `result` (browser → server)

The response to a single `cmd`. Always exactly one `result` per `cmd`, identified by `id`.

```json
{ "type": "result", "id": "<uuid>", "ok": true,  "data": <any> }
{ "type": "result", "id": "<uuid>", "ok": false, "error": "<message>" }
```

`data` is omitted (or `null`) when the action returns no payload. See [Errors](#errors).

### `ping` / `pong` (either direction)

```json
{ "type": "ping" }
{ "type": "pong" }
```

Keepalive only. Either side may send `ping`; the receiver must reply `pong` promptly. The browser does not ping; it pongs.

## Connection lifecycle

The browser is a long-lived background tab and Chrome will throttle it heavily when out of focus (e.g. while the user is in Claude Desktop). Build your server with these rules:

- **Heartbeat:** server sends `ping` every 15 s. A healthy browser pongs within ~1 s when the tab is foregrounded, but a backgrounded tab may take 10–30 s. **Require two consecutive missed pongs before terminating** (≈30 s tolerance). The reference server uses exactly this.
- **Reconnect:** after `close`, the browser reconnects with a 1 s base delay. Close codes `1001` and `1008` mean "another client took my place" — back off with **2–5 s random jitter** to avoid two reconnect cycles synchronising.
- **Single-client semantics:** when a second client connects, close the prior socket with code `1001 "superseded by new connection"`. Reject brand-new connections with `1008 "already connected"` only inside a short cooldown window (~3 s) after a previous accept — otherwise legitimate fast reconnects get rejected.
- **No volume loaded:** most commands return an `error: "No volume loaded"` until the user opens a study. Poll `get_state` to detect when `volumeLoaded` becomes `true`.

## Coordinate systems

A consistent coordinate frame is the most error-prone part of any imaging API. PrismaMRI uses three different conventions; mixing them up is the single most common integration bug.

| Frame | Origin | Range | Used by |
| --- | --- | --- | --- |
| **Voxel** `{x, y, z}` | array index, 0-based | `0 … dims[axis]-1` | `cursor`, `add_annotation` (returned), `set_measurement` |
| **Slice index** | 1-based | `1 … sliceTotals[plane]` | `navigate_to_slice`, `step.result.slice`, `sliceIndices` in results |
| **Fractional pin** `(fx, fy)` | top-left of the captured image | `0.0 … 1.0` | `add_annotation` (input only) |

### Plane → axis mapping

| Plane | Constant axis | In-plane axes (image-space) |
| --- | --- | --- |
| `coronal`  | `y` (cursor.y → slice index = `y + 1`) | x → right, z → down |
| `sagittal` | `x` (cursor.x → slice index = `x + 1`) | y → right, z → down |
| `axial`    | `z` (cursor.z → slice index = `z + 1`) | x → right, y → down |

To place a pin from a captured image, measure the pixel coordinates in the returned PNG, divide by image width/height to get `fx`/`fy`, and send `add_annotation` with the same `plane`. The server will compute the corresponding voxel using the cursor's value on the constant axis.

### Spacing

`spacing: [sx, sy, sz]` is millimetres per voxel along the X/Y/Z axes. Use it to convert voxel distances to physical distances. `set_measurement` does this automatically and returns `distanceMm`.

## Commands

The fields below are the JSON keys at the **top level** of the `cmd` message (siblings of `type`, `id`, `action`). Responses describe `data` inside `result`.

### State

#### `get_state`

Read the full viewer state. Cheap; safe to poll.

**Params:** none.

**Returns:**
```ts
{
  volumeLoaded: boolean,
  dims:    [number, number, number] | null,
  spacing: [number, number, number] | null,
  cursor:  { x: number, y: number, z: number } | null,
  sliceIndices: { coronal: number, sagittal: number, axial: number } | null,  // 1-based
  sliceTotals:  { coronal: number, sagittal: number, axial: number } | null,
  wl: { window: number, level: number },
  preset: "mip" | "tissue" | "bone"
}
```

#### `overview`

Centre the cursor at `dims / 2` and return volume metadata plus a centre-slice capture on every plane. Best first call after a volume is loaded — one round-trip gives the LLM enough context to plan its analysis.

**Params:** none.

**Returns:**
```ts
{
  meta: {
    dims:    [number, number, number],
    spacing: [number, number, number],
    modality?: string,
    scanner?:  string,
    protocol?: string,
    scalarMin: number,
    scalarMax: number,
    formatId:  "dicom" | "nifti" | "metaimage" | "nrrd"
  },
  cursor: { x: number, y: number, z: number },
  sliceIndices: { coronal: number, sagittal: number, axial: number },
  images: {
    coronal:  string,  // base64 PNG
    sagittal: string,
    axial:    string
  }
}
```

### Navigation

#### `navigate`

Move the crosshair to an absolute 1-based slice on one plane. Other planes are unaffected.

**Params:**
```ts
{ plane: "coronal" | "sagittal" | "axial", slice: number }
```

`slice` is clamped to `[1, sliceTotals[plane]]`.

**Returns:** `null`.

#### `step`

Move the crosshair by a relative step count (positive = forward in the dimension, negative = backward).

**Params:**
```ts
{ plane: "coronal" | "sagittal" | "axial", steps: number }
```

**Returns:**
```ts
{ slice: number, total: number }  // 1-based, after clamp
```

#### `navigate_center`

Jump the crosshair to the volume centre (`dims / 2`).

**Params:** none.

**Returns:**
```ts
{ sliceIndices: { coronal: number, sagittal: number, axial: number } }
```

### Display

#### `set_wl`

Set window/level to exact numeric values (matched to the volume's scalar range).

**Params:**
```ts
{ window: number, level: number }
```

**Returns:** `null`.

#### `apply_wl_preset`

Apply a named W/L preset. Presets are stored as fractions of `[scalarMin, scalarMax]` so they adapt to any modality / vendor.

**Params:**
```ts
{ preset: "full_range" | "t1" | "t2" | "flair" | "soft_tissue" | "bone" | "high_contrast" }
```

Unknown preset → falls back to `full_range`.

Fractions used (`[windowFraction, levelFraction]`):

| Preset | Window | Level (from min) |
| --- | --- | --- |
| `full_range`    | 1.00 | 0.50 |
| `t1`            | 0.60 | 0.50 |
| `t2`            | 0.70 | 0.65 |
| `flair`         | 0.65 | 0.60 |
| `soft_tissue`   | 0.35 | 0.55 |
| `bone`          | 0.90 | 0.70 |
| `high_contrast` | 0.25 | 0.50 |

**Returns:** the resolved values.
```ts
{ window: number, level: number }
```

#### `set_preset`

Switch the 3-D render mode.

**Params:**
```ts
{ preset: "mip" | "bone" }
```

> **Note:** `"tissue"` exists in the UI but is **rejected** by this command — it requires per-voxel compositing that exceeds the capture time budget. The error message tells you to use `bone` for skeletal/dental CT or `mip` for general overview.

**Returns:** `null`.

#### `set_slab_mm`

Set the slab-MIP thickness applied to **all three** 2-D panels. `0` = single slice. Clamped to `[0, 50]`.

**Params:**
```ts
{ slab_mm: number }
```

**Returns:**
```ts
{ slabMm: number }  // post-clamp value actually applied
```

### Capture

All capture commands return base64-encoded image data with **no `data:` URI prefix**. PNG for slice captures (lossless, sharp at native resolution), JPEG for 3-D (smaller payload). Long-edge cap: 512 px. JPEG quality: 0.92.

#### `capture_slice`

Capture a single plane.

**Params:**
```ts
{
  plane: "coronal" | "sagittal" | "axial",
  slab_mm?: number  // 0 or omitted → live canvas grab; > 0 → native slab MIP
}
```

When `slab_mm > 0`, the image is rendered directly from the voxel buffer at native resolution (independent of the panel's current slab setting). When omitted/zero, the live canvas is captured — this includes any overlays currently drawn (cursor lines, existing annotations).

**Returns:**
```ts
{ imageData: string, slabMm?: number }  // base64 PNG
```

#### `capture_3d`

Screenshot the 3-D viewport exactly as displayed. Set the render preset first via `set_preset` if needed.

**Params:** none.

**Returns:**
```ts
{ imageData: string }  // base64 JPEG
```

#### `capture_all`

Capture coronal + sagittal + axial at the current cursor in one round trip. Cheaper than three `capture_slice` calls when you just want the orthogonal triplet.

**Params:** none.

**Returns:**
```ts
{ coronal: string, sagittal: string, axial: string }  // base64 PNGs
```

#### `overview_grid`

Capture N evenly-spaced slices across one plane — a "contact sheet" for surveying a plane without manual navigation. Always uses a 3 mm slab to improve conspicuity.

**Params:**
```ts
{
  plane: "coronal" | "sagittal" | "axial",
  count?: number  // 2–4 (default 4). Note: the MCP server advertises 2–8 but the browser clamps to 4.
}
```

**Returns:**
```ts
{ images: string[], indices: number[], total: number }  // images parallel to indices (1-based)
```

### Annotations

Findings persist per volume in the browser's `localStorage` and reattach automatically when the same volume is reopened. The full set is also drawn on the 3-D model and in the findings HUD.

#### `add_annotation`

Place a finding. Coordinates are given as fractions of the captured image (see [Coordinate systems](#coordinate-systems)).

**Params:**
```ts
{
  plane:    "coronal" | "sagittal" | "axial",
  fx:       number,                  // 0.0–1.0, left→right
  fy:       number,                  // 0.0–1.0, top→bottom
  label:    string,                  // short title
  severity: "critical" | "serious" | "moderate" | "comment",  // default "serious" if missing/invalid
  summary?:    string,               // 1–3 sentence description
  confidence?: number,               // 0–100, clamped & rounded
  size_mm?:    number                // longest in-plane diameter
}
```

The voxel is computed from `(fx, fy)` + the cursor's value on the plane's constant axis, then snapped to nearby anatomy of high contrast. The returned id is needed to delete this specific finding later.

**Returns:**
```ts
{ id: string }  // UUID v4
```

#### `remove_annotation`

```ts
// params
{ id: string }
// returns: null (error "Annotation <id> not found" if unknown)
```

#### `list_annotations`

```ts
// returns
{
  annotations: Array<{
    id: string,
    plane: "coronal" | "sagittal" | "axial",
    voxel: { x: number, y: number, z: number },
    label: string,
    summary: string | null,
    severity: "critical" | "serious" | "moderate" | "comment"
  }>,
  count: number
}
```

#### `clear_annotations`

Wipe every finding for the current volume. **Returns:** `null`.

### Measurement

Exactly one measurement exists at a time; `set_measurement` replaces any prior one.

#### `set_measurement`

```ts
// params
{
  from: { x: number, y: number, z: number },  // voxel
  to:   { x: number, y: number, z: number }
}
// returns
{
  from: { x, y, z },           // post-clamp & rounded
  to:   { x, y, z },
  distanceMm: number | null    // null if spacing missing
}
```

#### `get_measurement`

```ts
// returns
{
  hasMeasurement: boolean,
  from: { x, y, z } | null,
  to:   { x, y, z } | null,
  distanceMm: number | null
}
```

#### `clear_measurement`

**Returns:** `null`.

## Errors

A failed command always returns:

```json
{ "type": "result", "id": "<uuid>", "ok": false, "error": "<human-readable message>" }
```

Common error strings:

| Error | Cause |
| --- | --- |
| `No volume loaded` | The user hasn't opened a study yet. Wait for `get_state.volumeLoaded === true`. |
| `Unknown action: <name>` | Action not in the dispatcher. Likely a version mismatch between your client and the app. |
| `Canvas for <plane> not available` | The plane's panel isn't mounted (e.g. fullscreen mode hides others). `capture_slice` with `slab_mm > 0` bypasses canvases entirely. |
| `3-D view not ready` | The 3-D scene hasn't initialised yet. |
| `"tissue" preset is not available via MCP — …` | See [`set_preset`](#set_preset). |
| `Annotation <id> not found` | Stale id, or the volume was changed. |
| `slab_mm must be a non-negative number` | Validation. |
| `\`from\` and \`to\` must each be {x, y, z} voxel coordinates` | Validation. |

The browser never throws unhandled errors back to the wire — every handler either calls `ok()` or `fail()` exactly once.

## Minimal client examples

### Node.js — capture three orthogonal slices

```js
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

const ws = new WebSocket('ws://127.0.0.1:7389');
const pending = new Map();

function cmd(action, params = {}) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ type: 'cmd', id, action, ...params }));
  });
}

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === 'ping') { ws.send('{"type":"pong"}'); return; }
  if (msg.type !== 'result') return;
  const req = pending.get(msg.id);
  if (!req) return;
  pending.delete(msg.id);
  msg.ok ? req.resolve(msg.data) : req.reject(new Error(msg.error));
});

ws.on('open', async () => {
  const state = await cmd('get_state');
  if (!state.volumeLoaded) { console.error('Open a volume first.'); process.exit(1); }
  const captures = await cmd('capture_all');
  // captures.coronal / .sagittal / .axial are base64 PNGs
  await import('node:fs').then(fs =>
    fs.writeFileSync('axial.png', Buffer.from(captures.axial, 'base64'))
  );
  ws.close();
});
```

### Port scan

If you don't know which port the app is on, scan in parallel:

```js
const PORTS = [7389, 7390, 7391, 7392, 7393];
const sockets = PORTS.map(p => new WebSocket(`ws://127.0.0.1:${p}`));
const ws = await Promise.any(sockets.map(s => new Promise((res, rej) => {
  s.once('open', () => res(s));
  s.once('error', rej);
})));
sockets.filter(s => s !== ws).forEach(s => s.terminate());
```

### Server (you own the port, browser connects to you)

See [`mcp-server/src/index.ts`](../mcp-server/src/index.ts) — specifically `startLocalServer()` for the HTTP-server wrapper, PNA-preflight response, accept cooldown, and ping watchdog. Around 120 lines of reference code; copyable as a starting point for any other companion process.
