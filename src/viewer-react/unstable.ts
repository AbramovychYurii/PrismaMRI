/**
 * @prisma-mri/viewer-react/unstable — the viewer's plumbing.
 *
 * No semver here. The store (field and action names change whenever the viewer needs it);
 * the context hooks and the resolvers the viewer's own components are built on; the layout
 * helper. A host that wants to stay put uses the viewer's methods and `useViewerSnapshot`,
 * and passes `theme`, `features` and `labels` to `<Viewer>`, from the main entry.
 */
export {
  type ViewerActions,
  type ViewerState,
  type ViewerStore,
  type ViewerStoreState,
  createViewerStore,
} from './viewer/store';
export { getViewerStore } from './viewer/createViewer';
export { useViewerStore, useViewerStoreApi } from './viewer/context';
export {
  usePortalContainer,
  useViewerEnvironment,
  useViewerFeatures,
  useViewerHost,
  useViewerLabels,
  useViewerLayout,
  useViewerTheme,
} from './viewer';
export { resolveFeatures } from './viewer/features';
export { resolveLabels } from './viewer/labels';
export { resolveTheme, themeCssVars, withAlpha } from './viewer/theme';
export { MOBILE_MAX_WIDTH, type ViewerLayoutMode, useContainerLayout } from './viewer/layout';
