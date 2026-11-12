import { type ViewerStore, type ViewerStoreOptions, createViewerStore } from '@/viewer/store';
import { type ViewerSurfaces, createViewerSurfaces } from '@/viewer/surfaces';

/** One viewer: its state and the surfaces it draws on. */
export interface Viewer {
  store: ViewerStore;
  surfaces: ViewerSurfaces;
}

export type ViewerOptions = ViewerStoreOptions;

export function createViewer(options: ViewerOptions = {}): Viewer {
  return { store: createViewerStore(options), surfaces: createViewerSurfaces() };
}
