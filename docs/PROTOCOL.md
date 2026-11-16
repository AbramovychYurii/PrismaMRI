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
  - [Series](#series)
  - [Annotations](#annotations)
  - [Measurement](#measurement)
  - [Voxel analysis](#voxel-analysis)
- [Errors](#errors)
- [Minimal client examples](#minimal-client-examples)

## Transport & discovery

- **Transport:** plain WebSocket (no TLS) on `127.0.0.1`.
- **Role:** the *companion process* runs the WebSocket **server**; the *browser app* is the **client** that connects out to it. (This is reversed from what most people expect — it's done this way so the browser PWA, which cannot bind a port, is always the initiator.)
- **Ports tried, in order:** `7389, 7390, 7391, 7392, 7393`. Pick the first free one. If binding fails with `EADDRINUSE`, move on to the next port instead of exiting: Claude Desktop starts one copy of the server per surface (chat, Cowork and Code sessions), so a second copy finding `7389` taken is normal.
- **PNA preflight:** Chromium-based browsers send a [Private Network Access](https://developer.chrome.com/blog/private-network-access-preflight) preflight before upgrading to WebSocket from a public origin (e.g. the GitHub-Pages-hosted PWA). Your server **must** respond to plain HTTP requests on the same port with:
  ```
  HTTP/1.1 200 OK
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Private-Network: true
  Access-Control-Allow-Headers: *
  Access-Control-Allow-Methods: GET, OPTIONS
  ```
  Otherwise Chrome silently blocks the upgrade. See [`mcp-server/src/index.ts`](../mcp-server/src/index.ts) for a reference implementation.
- **Browser discovery:** the PWA probes all five ports in parallel with a 300 ms timeout and **keeps a socket to every server that answers** — several servers can run at once and all of them drive the same viewer. Each command is answered on the socket it arrived on. While at least one server is connected, the PWA looks again every 15 s for one that started later, and after any socket closes. With nothing connected it does not poll.
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

Voxel axes are patient-aligned, whatever order the file stored them in: on import the volume is reordered so `x` runs towards the patient's left, `y` posterior and `z` superior (DICOM's LPS frame), taking the nearest axis for an oblique series. A file whose header records no orientation is kept as stored.

### Plane → axis mapping

| Plane | Constant axis | In-plane axes (image-space) |
| --- | --- | --- |
| `coronal`  | `y` (cursor.y → slice index = `y + 1`) | x → right, z → down |
| `sagittal` | `x` (cursor.x → slice index = `x + 1`) | y → right, z → down |
| `axial`    | `z` (cursor.z → slice index = `z + 1`) | x → right, y → down |

To place a pin from a captured image, measure the pixel coordinates in the returned image, divide by image width/height to get `fx`/`fy`, and send `add_annotation` with the same `plane`. The server will compute the corresponding voxel using the cursor's value on the constant axis.

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
  preset: "mip" | "tissue" | "bone",
  series: { count: number, active: string | null } | null  // null unless the study has several series
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
    bodyPart?: string,           // as declared by the file (DICOM Body Part Examined)
    species?: string,            // as declared by the file (DICOM Patient's Species Description)
    studyDescription?: string,
    scalarMin: number,
    scalarMax: number,
    formatId:  "dicom" | "nifti" | "mha" | "nrrd"
  },
  cursor: { x: number, y: number, z: number },
  sliceIndices: { coronal: number, sagittal: number, axial: number },
  images: {
    coronal:  string,  // base64 JPEG
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

All capture commands return base64-encoded image data with **no `data:` URI prefix**. Every image is a JPEG (quality 0.92), long edge capped at 512 px.

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
{ imageData: string, slabMm?: number }  // base64 JPEG
```

#### `capture_3d`

Screenshot the 3-D viewport. Set the render preset first via `set_preset` if needed.

**Params:**
```ts
{ view?: 'current' | 'coronal' | 'sagittal' | 'axial' | 'all' }  // default 'current'
```
- `current` — the camera exactly as the user left it.
- `coronal` / `sagittal` / `axial` — the standard view of that plane (frontal, lateral, top-down), the same one the slice panels' "View from this side" turns the camera to.
- `all` — those three in one answer.

The user's camera is turned and put back within the one call, so their view does not move. Nothing animates, so it also works while the tab is in the background.

**Returns:**
```ts
{ imageData: string, view?: string }  // base64 JPEG; `view` echoes a single plane view
// view: 'all' →
{ coronal: string, sagittal: string, axial: string }
```

Do not read left/right from these renders; take the side from the labelled 2-D planes.

#### `capture_all`

Capture coronal + sagittal + axial at the current cursor in one round trip. Cheaper than three `capture_slice` calls when you just want the orthogonal triplet.

**Params:** none.

**Returns:**
```ts
{ coronal: string, sagittal: string, axial: string }  // base64 JPEGs
```

#### `overview_grid`

Capture N evenly-spaced slices across one plane — a "contact sheet" for surveying a plane without manual navigation. Always uses a 3 mm slab to improve conspicuity.

**Params:**
```ts
{
  plane: "coronal" | "sagittal" | "axial",
  count?: number  // 2–8 (default 5)
}
```

**Returns:**
```ts
{ images: string[], indices: number[], total: number }  // images parallel to indices (1-based)
```

### Series

A DICOM folder often holds several series (T1, T2, FLAIR, a localizer, the same scan in another plane). The viewer opens one at a time and keeps the files of the others, so it can switch in place. Everything else — captures, measurements, analysis, annotations — applies to the series that is open. After a page reload the other series are still there when the browser cache had room for the study's files; otherwise the restored volume has a single series.

#### `list_series`

**Params:** none.

**Returns:**
```ts
{
  count: number,                     // 0 for a single-series volume
  active: string | null,             // key of the open series
  series: Array<{
    index: number,                   // 1-based position
    key: string,                     // SeriesInstanceUID, else a geometry fingerprint
    label: string,                   // series description
    orientation: "Axial" | "Sagittal" | "Coronal" | "Oblique" | null,
    modality: string | null,
    slices: number,
    matrix: [number, number],        // columns, rows
    active: boolean,
    findings: number                 // known findings on that series (see note below)
  }>,
  note: string
}
```
`findings` is exact for the open series and for series that were open earlier in the session; a series never opened has none known.

#### `switch_series`

Opens another series in place. Resolves when it is on screen — re-assembling a large series from the loaded files takes seconds, so allow a long timeout (the reference server waits 90 s). The crosshair, window/level, render preset and slab go back to the new series' defaults. Findings stay with the series they were placed on.

**Params:**
```ts
{ series: number | string }   // 1-based position from list_series, its label (case-insensitive), or its key
```

**Returns:**
```ts
{
  active: string,                       // key
  label: string,
  orientation: "Axial" | "Sagittal" | "Coronal" | "Oblique" | null,
  dims: [number, number, number],
  spacing: [number, number, number],
  modality?: string,
  findings: number,                     // findings on this series
  note: string
}
```
Errors: the volume has a single series; no such series (the message lists the choices); the series could not be assembled (the viewer's error text).

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

The voxel is computed from `(fx, fy)` + the cursor's value on the plane's constant axis, then snapped to nearby anatomy of high contrast. The finding belongs to the series that is open — in a multi-series study, `switch_series` first to place one on another. The returned id is needed to delete this specific finding later.

**Returns:**
```ts
{ id: string }  // UUID v4
```

#### `remove_annotation`

```ts
// params
{ id: string }
// returns: null (error "Annotation <id> not found" if unknown; for a finding on a series that is not
// open, an error naming that series — switch_series to it first)
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
    severity: "critical" | "serious" | "moderate" | "comment",
    series: string | null,   // label of the series it is on; null for a single-series volume
    onScreen: boolean        // on the series that is open now
  }>,
  count: number
}
```
In a multi-series study the list covers every series shown this session, open one first. `voxel` is in the coordinates of the finding's own series.

#### `clear_annotations`

Wipe every finding on the series that is open. **Returns:** `null`.

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

### Voxel analysis

These commands read the voxel buffer in the browser and answer with a few lines of numbers — no image unless stated. They are meant for deciding **where to look** and for **measuring**; the capture commands show what is there. All positions are **zero-based voxel** coordinates (`{x, y, z}`) in the patient-aligned frame described under [Coordinate systems](#coordinate-systems); sizes are millimetres.

Every result that depends on a threshold or a coarser working grid says so (`threshold`, `resolutionVoxels`, `smoothed`) — quote them when reporting a negative.

> **What these are not.** They are heuristics validated on synthetic phantoms (see [`docs/RESEARCH.md`](RESEARCH.md)). They find *candidates*; none of them diagnoses, and every candidate must be confirmed by looking. `resolutionVoxels` > 1 means the volume was too large to analyse at full resolution and small structures may be missed.

#### `survey_subject`

Params: none. Returns the grid and field of view; what the file `declared` (modality, bodyPart, species, studyDescription, protocol, scanner — each optional); `intensity` (min, max, percentiles, the two Otsu thresholds `subjectThreshold` and `denseThreshold`, `looksLikeHounsfield`); the `subject` (volume mL, extent, principal axes and spread, `elongation`, `flatness`, separate `pieces`); `dense` (fraction of the subject, number of dense pieces); `symmetry` (best axis, overlap, per-axis overlap); and plain-language `notes`.

#### `roi_stats`

```ts
// params — a sphere (default: at the cursor, 5 mm) or a box
{ center?: Voxel, radius_mm?: number }  |  { min: Voxel, max: Voxel }
// returns
{ shape, voxels, volumeMm3, mean, sd, min, max,
  percentiles: [p5, p25, p50, p75, p95],
  histogram: { from, to, counts: number[12] }, note? }
```

#### `line_profile`

```ts
{ from: Voxel, to: Voxel, samples?: number }      // samples default 64, max 256
// returns
{ lengthMm, stepMm, values: number[], min: {value, atMm}, max: {value, atMm}, steepestEdgeAtMm }
```

#### `slice_curve`

```ts
{ axis: "x"|"y"|"z", metric: "area_above"|"mean"|"max", threshold?: number, max_points?: number }
// returns
{ axis, metric, threshold?, values: number[], slicesPerValue, peaks: { slice, value }[3] }
```

`area_above` is the area in mm² of voxels above `threshold` (default: the tissue threshold) in each slice.

#### `find_objects`

Connected objects above an intensity threshold, numbered by size. Later `axis_profile` and `check_arrangement` calls refer to these ids and use the **last** result.

```ts
{ level?: "dense"|"subject", threshold?: number, threshold_max?: number,
  min_volume_mm3?: number,           // default 5
  split_touching?: boolean,          // split parts joined by a narrow neck
  max_objects?: number,              // default 25, max 60
  region?: { min: Voxel, max: Voxel } }
// returns
{ threshold, thresholdMax?, resolutionVoxels, split, found, shown,
  objects: { id, volumeMm3, centroidVoxel, bboxVoxel, extentMm, lengthMm,
             elongation, flatness, longAxis }[] }
```

`elongation` is 1 for a ball and large for a rod; `flatness` is large for a sheet. `split_touching` finds *necks*: parts joined by a wide bridge stay joined.

#### `axis_profile`

```ts
{ object_id: number, segments?: number }          // segments default 24
// returns
{ id, lengthMm, straightness, maxBend: { angleDeg, atMm, centroidVoxel } | null,
  diameterMm: number[], narrowest: { diameterMm, atMm }, widest: { diameterMm, atMm }, path: Voxel-like[] }
```

Follows the object along its long axis. `maxBend` compares the centre line a little before and after each point; a normal curved bone also bends, so compare with the other side.

#### `check_arrangement`

For a row of objects that should be regular (teeth, vertebrae, ribs). Needs ≥ 5 objects from a previous `find_objects`.

```ts
{ plane?: "axial"|"coronal"|"sagittal",           // plane the row lies in (axial for a dental arch)
  object_ids?: number[],                           // default: objects of typical size
  min_offset_mm?: number,                          // default 3
  min_tilt_excess_deg?: number }                   // default 20
// returns
{ plane, count, curve: {a,b,c}, medianTiltDeg, medianSpacingMm,
  warning?: string,                                // set when so many objects deviate that the selection is not one regular row
  items: { id, centroidVoxel, offCurveMm, offLevelMm, tiltDeg, gapToNextMm, flags: string[] }[] }
```

Fits a curve robustly through the centroids and reports each object's distance from it and from the row's usual level, how much it leans against its neighbours (least angle to either neighbour; `null` for round objects), the gap to the next object relative to the gaps around it, and plain-language flags. Density is not used.

#### `check_symmetry`

```ts
{ axis?: "x"|"y"|"z",                              // default: the best-fitting axis
  region?: { min: Voxel, max: Voxel } }            // limit to a box around the subject (couch, second subject)
// returns
{ axes: { x|y|z: { planeVoxel, dice } }, best, planeVoxel, dice,
  sides: { low, high },                            // e.g. "right" / "left" for x
  volumeMm3: { low, high }, asymmetryIndex,
  profile: { axis, slabs: { fromVoxel, toVoxel, asymmetry | null }[12] },
  unmatched: { side, volumeMm3, centroidVoxel, extentMm, bboxVoxel }[],
  resolutionVoxels }
```

Finds the plane that best mirrors the subject (`dice` = overlap, 1 = perfect) and lists the parts that have **no counterpart** on the other side. Only meaningful for bilateral anatomy; a low `dice` on every axis means the subject is not mirror-symmetric. The side names assume the volume was patient-aligned on import.

#### `find_gaps`

Thin, flat gaps inside dense material — crack and fracture **candidates**.

```ts
{ threshold?: number, max_gap_mm?: number,         // default 2, range 0.3–8
  min_area_mm2?: number,                           // default 15
  max_voxels?: number,                             // default 40 000 000; above this the volume is analysed on a coarser grid
  region?: { min: Voxel, max: Voxel } }
// returns
{ threshold, maxGapMm, resolutionVoxels, smoothed, rawPieces,
  candidates: { id, centroidVoxel, thicknessMm, areaMm2, planarity, enclosure, normal, lengthMm }[] }
```

`planarity` is near 0 for a flat sheet and near 1 for a tube or a ball; `enclosure` is the share of the gap with dense material on both faces. Joint spaces, sutures, the periodontal space and thin canals also qualify. Gaps narrower than a voxel are not seen. `smoothed: true` means the noise was loud enough to blur the volume first, which hides the thinnest gaps. Meaningful on CT/CBCT, not on MRI.

#### `navigate_to_voxel`

```ts
{ voxel: Voxel }  →  { cursor: Voxel }              // clamped to the volume
```

#### `capture_region`

A close-up cropped from the **full-resolution** slice, not a magnified thumbnail.

```ts
{ plane, center?: Voxel,                           // default: the cursor
  fov_mm?: number,                                 // 5–400, default 40
  size?: number,                                   // long edge in px, 128–1280, default 640
  slab_mm?: number }
// returns
{ imageData: string, plane, sliceNumber, centerVoxel, fovMm: [w, h],
  mmPerPixel, nativeMmPerVoxel: [h, v], windowLevel }
```

Does not move the crosshair. The image uses the viewer's current window and level.

#### `capture_montage`

Several slices of one plane on one captioned sheet.

```ts
{ plane, count?: number,                           // 2–20, default 12
  from_slice?: number, to_slice?: number,          // 1-based range, default the whole plane
  slab_mm?: number,                                // default 3
  size?: number }                                  // sheet long edge, 400–1280, default 1200
// returns
{ imageData: string, plane, slices: number[], total, columns, slabMm, windowLevel }
```

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
  // captures.coronal / .sagittal / .axial are base64 JPEGs
  await import('node:fs').then(fs =>
    fs.writeFileSync('axial.jpg', Buffer.from(captures.axial, 'base64'))
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
