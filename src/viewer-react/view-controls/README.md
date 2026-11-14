# View controls

Rotate the 3-D volume about three screen axes, align it to a slice plane, and
zoom — from the keyboard or an on-screen panel (a dock on desktop and tablet, a
bottom sheet on phones). Every part can be configured or switched off.

The feature is split along the viewer's package line:

| Where | Package | What |
|---|---|---|
| `src/viewer-core/view-controls/` | `@prisma-mri/viewer-core` | Actions, key combos, the versioned config, the headless controller, storage, and `adapters/three.ts`. No React. |
| `src/viewer-react/view-controls/` | `@prisma-mri/viewer-react` | Provider, hooks, `<ViewControls/>`, Dock, Launcher, Sheet, Readout, `<ShortcutSettings/>` (+ Dialog), `styles.css`. |

The UI never touches Three.js: it drives a `ViewControlsTarget`.

## Inside the PrismaMRI viewer

`<Viewer>` mounts everything itself; a host only passes options:

```tsx
<Viewer
  viewer={viewer}
  viewControls={{
    // all optional — keep the object stable
    config,            // controlled config (memoise it); omitted → storage, else defaults
    storage,           // ConfigStorage; default localStorage "prismamri.viewControls"; null → none
    onConfigChange,    // (config) => save it to a user profile, …
    onAction,          // (id, 'keyboard' | 'pointer' | 'api') => analytics
    messages,          // any of the panel's words
  }}
/>
```

What the viewer does with it:

- **Target.** `useViewControlsTarget` builds `createThreeViewTarget` from
  `ThreePreview.viewHandles()` after every volume load (the camera and trackball
  are rebuilt then); the controller and its config survive the swap. Rotation
  turns `ThreePreview`'s centred volume pivot (volume, markers, measurement), not
  the camera.
- **Planes.** World axes are DICOM LPS. Align C / S / A place the camera so the
  3-D view reads like the slice panels: coronal from the front (R ← → L,
  superior up), sagittal from the patient's left (A ← → P), axial from the feet
  (R ← → L, anterior up).
- **Keys.** They listen on the viewer's `keyboardTarget`. ↑ / ↓ also step the
  active slice: they pitch while the pointer or focus was last in the 3-D stage,
  and step slices while it was in a slice panel (`hooks/useKeyZone.ts`). On the
  tabbed layout the keys only act while the 3-D tab is shown, and never while a
  host modal (`[aria-modal="true"]`) is open.
- **Phone sheet.** The stage ends above the tab bar, so `--pmv-vc-sheet-bottom`
  stays 0. While the sheet is open the stage sets `--pmri-stage-inset-bottom` to
  its height (the agent button rides above it) and the camera re-centres the
  model in what stays visible (`ThreePreview.setFramingInset`).
- **Desktop dock panel.** While the viewer's bottom controls dock is open the
  stage sets `--pmv-vc-bottom: 200px`, so the floating dock and launcher sit
  above it.
- **Settings.** `?`, the dock's settings button, or the stage menu's
  "View controls…" (the way in on tablets, and back after switching everything
  off).
- **CTRL tab.** Not wired: in this app it opens the Display / Render / Study /
  Session view, so the sheet opens from the round launcher (`phoneTrigger` makes
  no difference here).

## Using the parts on their own

```tsx
import { createThreeViewTarget, localStorageConfigStorage } from '@prisma-mri/viewer-core';
import { ViewControls, ViewControlsProvider } from '@prisma-mri/viewer-react';

const storage = localStorageConfigStorage('my-app.viewControls');

const target = createThreeViewTarget({
  camera,            // Perspective or Orthographic
  model,             // the volume root, pivoting at its centre (wrap it in a centred Group if needed)
  controls,          // optional: anything with target + update() (+ 'change' events)
  requestRender,     // optional: for render-on-demand loops
  planes,            // optional: { coronal | sagittal | axial: { eye, up } } — defaults are LPS
  setFramingInset,   // optional: keep the model centred above the phone sheet
});

<div style={{ position: 'relative' }}>
  <ViewControlsProvider target={target} storage={storage} keyboardScope={viewerEl} viewerElement={viewerEl}>
    <canvas />
    <ViewControls onInsetChange={({ bottom }) => /* move your chrome */ null} />
  </ViewControlsProvider>
</div>
```

`target` may be `null` until the scene exists (buttons render and do nothing).
Leave it `undefined` to call `controller.setTarget()` yourself.

### `ViewControlsTarget`

```ts
rotate(axis: 'pitch' | 'yaw' | 'roll', degrees: number): void  // screen-aligned axes
alignToPlane(plane: 'coronal' | 'sagittal' | 'axial'): void     // resets rotation, looks along the normal
zoomBy(factor: number): void                                     // > 1 zooms in
fitToView(): void
resetView(): void
getViewState?(): { pitch; yaw; roll; zoom }                      // feeds the readout
subscribe?(listener): () => void                                 // view changed (gestures too)
setFramingInset?({ bottom }): void                               // px covered by the phone sheet
```

### Provider props

`target`, `config` (controlled), `storage`, `onConfigChange`, `onAction`,
`keyboardScope` (`'document'` default, an element, `window`, or `null`),
`viewerElement` (with several viewers on a page, keys go to the focused or
hovered one), `shouldHandleKey(e)` (veto, e.g. while a modal is open),
`messages`, `controller` (bring your own).

### Hooks and components

`useViewControls()` (the controller: `trigger`, `pressStart` / `pressEnd`,
`togglePanel`, `setShortcutsOpen`, `updateConfig`, `actionForKey`, …),
`useViewControlsState(selector)`, `useOptionalViewControls()`,
`useViewReadout()`, `useFormFactor()`, `useMotion()`; `<ViewControls/>`,
`<ShortcutSettings/>` (inline, e.g. in a settings page), `<ShortcutSettingsDialog/>`.

A host tab or button can open the phone sheet with `controller.togglePanel()`
and show its active state from `useViewControlsState((s) => s.config.panel.open)`;
set `panel.phoneTrigger` to `'host'` to hide the built-in launcher.

## Configuration

`ViewControlsConfig` is versioned and validated; anything corrupt falls back to
the defaults.

| Key | Default | |
|---|---|---|
| `enabled` | `true` | Master switch: no keys, no panel. |
| `keyboard.enabled` / `keyboard.bindings` | `true` / see below | Several combos per action. |
| `panel.enabled` / `panel.open` | `true` / `true` | `open` is remembered. |
| `panel.keycaps` | `'auto'` | `auto`: on fine pointers, and on touch once a key press is seen. |
| `panel.phoneLayout` | `'rows'` | `'tabs'`: Rotate / Slice / Zoom tiles. |
| `panel.phoneTrigger` | `'both'` | `'button'`, `'host'`, `'both'`. |
| `panel.readout` | `true` | "P 12° · Y −25° · R 0° · 125%" on tablet and phone. |
| `actions[id]` | all `true` | Off: no key, no button; an empty group disappears. |
| `step.rotateDeg` | `5` | UI offers 1 / 5 / 15 / 90. |
| `step.zoomPercent` | `10` | Multiplicative: 10 % = ×1.1. |
| `step.shiftMultiplier` | `3` | Shift on rotate and zoom. |
| `step.holdDelayMs` / `step.holdIntervalMs` | `300` / `50` | Press and hold: one step per interval, rAF-timed. |
| `motion` | `'auto'` | `'reduced'`: 150 ms fades; `'none'`: no animation. |

Default keys: ↑ ↓ pitch, ← → yaw, Q E roll, C S A align, − 0 + (and =) zoom,
R reset, K panel, ? settings. Letters, digits and arrows match by
`event.code` (so they work on any layout); symbols by `event.key`.

## Theming

Set any of these on an ancestor of the controls (the viewer sets the fonts and
plane colours from its own theme on the stage):

| Variable | Default |
|---|---|
| `--pmv-vc-accent` | `#e8a33d` |
| `--pmv-vc-plane-c` / `-s` / `-a` | `#e8a33d` / `#bba3e8` / `#8fb6ea` |
| `--pmv-vc-panel` / `--pmv-vc-sheet` / `--pmv-vc-surface` / `--pmv-vc-hover` | `rgba(17,14,11,.93)` / `#14120f` / `#1b1815` / `#25211c` |
| `--pmv-vc-border` / `--pmv-vc-border-strong` | `#34302a` / `#3a352e` |
| `--pmv-vc-text` / `--pmv-vc-muted` | `#e9e4dc` / `#a39c92` |
| `--pmv-vc-font` / `--pmv-vc-mono` / `--pmv-vc-serif` | Inter / JetBrains Mono / Instrument Serif |
| `--pmv-vc-bottom` | `0px` — host chrome covering the bottom of the viewport |
| `--pmv-vc-dock-bottom` | `58px` (tablet `20px`) above that |
| `--pmv-vc-sheet-bottom` | `--pmv-vc-bottom` — the tab bar's height when the viewport runs under it |
| `--pmv-vc-readout-top` | `74px` |
| `--pmv-vc-z` | `20` |

## Motion

Open / close runs on the Web Animations API (`motion.ts`): on desktop the
launcher's button flies into the dock (0–200 ms), the dock grows out of it
(120–360 ms) and the groups stagger in (200–440 ms); closing reverses in 240 ms.
Tablet: the pill scales into the dock (220 ms). Phone: the sheet slides up
(280 ms) / down (200 ms). Toggling mid-way reverses from where it is; nothing
animates on mount; keys keep working throughout.
