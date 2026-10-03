/**
 * The viewer route's chunk — three.js and everything under AppGrid. Split from
 * the entry so the import screen paints without it; ImportOverlay prefetches it
 * right after mount, so it is normally ready before a volume finishes loading.
 */
export const loadViewerPage = () => import('@/pages/ViewerPage');
