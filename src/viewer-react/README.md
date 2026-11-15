# @prisma-mri/viewer-react — state, events and lifecycle

The viewer is driven through its instance, not through its store. The store's
field names are not a contract (they live in `…/unstable`); everything below is.

```tsx
const viewer = createViewer();

<Viewer viewer={viewer} />
```

## Read

```ts
const snap = viewer.getSnapshot();          // same object until something changes
const stop = viewer.subscribe((next, prev) => { … });
```

In React, `useViewerSnapshot((s) => s.cursor)`. The selector must return a
field or a primitive, not a freshly built object.

## Command

`setCursor`, `setWindowLevel`, `setRenderPreset`, `setSlabMm`, `setMeasurement`,
`clearMeasurement`, `addAnnotation`, `replaceAnnotations`, `removeAnnotation`,
`clearAnnotations`, `setActiveAnnotation`, `focusAnnotation`, `load`, `loadUrl`,
`cancel`, `resolveSeries`, `switchSeries`, `restoreVolume`, `reset`.

A controlled cursor is `cursorchange` plus `setCursor`:

```ts
viewer.on('cursorchange', (cursor) => myStore.set(cursor));
myStore.subscribe((cursor) => cursor && viewer.setCursor(cursor));
```

## Events

`viewer.on(type, handler)` returns the function that stops listening; in React,
`useViewerEvent(type, handler)` does it for the component's lifetime.

| event | payload | fires |
|---|---|---|
| `loaded` | `LoadResult` | a volume landed — inside the load's synchronous commit |
| `error` | message | a load or import failed (not when the message clears) |
| `statuschange` | `'empty' \| 'loading' \| 'ready'` | |
| `cursorchange` | `VolumeCursor \| null` | |
| `windowlevelchange` | `{ window, level }` | |
| `presetchange` | render preset | |
| `annotationschange` | findings | |
| `activeannotationchange` | finding id or null | |
| `measurementchange` | measurement or null | |

State events fire after the change is in the snapshot, once per change, never
for the starting values. A handler that throws is logged and skipped.

## Lifecycle

`viewer.dispose()` aborts the load in flight, dismisses an open series choice
and removes every listener attached through `on`, `subscribe` and
`onVolumeLoaded`. Call it after unmounting `<Viewer>` (its own components
subscribe too). It is safe to call twice; the state stays and the viewer can be
used again, with no listeners.

Create the viewer once — outside React, or in `useState(() => createViewer())`
— and dispose it in the effect that owns it:

```tsx
const [viewer] = useState(() => createViewer());
useEffect(() => () => viewer.dispose(), [viewer]);
```
