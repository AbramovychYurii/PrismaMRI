import { type ViewerApi, createViewerApi } from './api';
import { type ViewerLoader, type ViewerLoaderOptions, createViewerLoader } from './loader';
import { type ViewerStore, type ViewerStoreOptions, createViewerStore } from './store';
import { type ViewerSurfaces, createViewerSurfaces } from './surfaces';

/**
 * One viewer: what a host reads and commands (`ViewerApi`), how volumes get in
 * (`ViewerLoader`) and the surfaces it draws on. The store behind it is not
 * part of this object — see `getViewerStore`.
 */
export interface ViewerInstance extends ViewerApi, ViewerLoader {
  surfaces: ViewerSurfaces;
}

export type ViewerOptions = ViewerStoreOptions & ViewerLoaderOptions;

const stores = new WeakMap<ViewerInstance, ViewerStore>();

export function createViewer(options: ViewerOptions = {}): ViewerInstance {
  const store = createViewerStore(options);
  const viewer: ViewerInstance = {
    ...createViewerApi(store),
    ...createViewerLoader(store, options),
    surfaces: createViewerSurfaces(),
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
