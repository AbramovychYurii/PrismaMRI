import { type ViewerLoader, type ViewerLoaderOptions, createViewerLoader } from './loader';
import { type ViewerStore, type ViewerStoreOptions, createViewerStore } from './store';
import { type ViewerSurfaces, createViewerSurfaces } from './surfaces';

/** One viewer: its state, the surfaces it draws on, and how volumes get into it. */
export interface ViewerInstance extends ViewerLoader {
  store: ViewerStore;
  surfaces: ViewerSurfaces;
}

export type ViewerOptions = ViewerStoreOptions & ViewerLoaderOptions;

export function createViewer(options: ViewerOptions = {}): ViewerInstance {
  const store = createViewerStore(options);
  return { store, surfaces: createViewerSurfaces(), ...createViewerLoader(store, options) };
}
