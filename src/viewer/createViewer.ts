import { type ViewerLoader, type ViewerLoaderOptions, createViewerLoader } from '@/viewer/loader';
import { type ViewerStore, type ViewerStoreOptions, createViewerStore } from '@/viewer/store';
import { type ViewerSurfaces, createViewerSurfaces } from '@/viewer/surfaces';

/** One viewer: its state, the surfaces it draws on, and how volumes get into it. */
export interface Viewer extends ViewerLoader {
  store: ViewerStore;
  surfaces: ViewerSurfaces;
}

export type ViewerOptions = ViewerStoreOptions & ViewerLoaderOptions;

export function createViewer(options: ViewerOptions = {}): Viewer {
  const store = createViewerStore(options);
  return { store, surfaces: createViewerSurfaces(), ...createViewerLoader(store, options) };
}
