import { type ViewerApi, createViewerApi } from './api';
import { type ViewerEventApi, createViewerEvents } from './events';
import { type ViewerLoader, type ViewerLoaderOptions, createViewerLoader } from './loader';
import { type ViewerStore, type ViewerStoreOptions, createViewerStore } from './store';
import { type ViewerSurfaces, createViewerSurfaces } from './surfaces';

/**
 * One viewer: what a host reads and commands (`ViewerApi`), how volumes get in
 * (`ViewerLoader`) and the surfaces it draws on. The store behind it is not
 * part of this object — see `getViewerStore`.
 */
export interface ViewerInstance extends ViewerApi, ViewerLoader, ViewerEventApi {
  surfaces: ViewerSurfaces;
}

export type ViewerOptions = ViewerStoreOptions & ViewerLoaderOptions;

const stores = new WeakMap<ViewerInstance, ViewerStore>();

export function createViewer(options: ViewerOptions = {}): ViewerInstance {
  const store = createViewerStore(options);
  const subscriptions = new Set<() => void>();
  const api = createViewerApi(store, subscriptions);
  const loader = createViewerLoader(store, options);
  const viewer: ViewerInstance = {
    ...api,
    ...loader,
    ...createViewerEvents(api, loader),
    surfaces: createViewerSurfaces(),
    dispose() {
      // Everything the host attached or started: the load in flight, the
      // `on` / `subscribe` / `onVolumeLoaded` listeners. The state stays, and
      // the viewer can be used again — it just has no listeners left.
      loader.dispose();
      for (const off of [...subscriptions]) off();
    },
  };
  stores.set(viewer, store);
  return viewer;
}

/**
 * The store behind a viewer — the viewer's own components read and write it.
 * Its shape is not a contract; a host goes through the viewer's methods and
 * `useViewerSnapshot`.
 */
export function getViewerStore(viewer: ViewerInstance): ViewerStore {
  const store = stores.get(viewer);
  if (!store) throw new Error('Not a viewer made by createViewer.');
  return store;
}
