import { ImportOverlay } from '@/components/layout/ImportOverlay';
import { ViewerActionsProvider } from '@/hooks/ViewerActionsContext';
import { useMcpBridge } from '@/hooks/useMcpBridge';
import { useViewerStoreEffects } from '@/hooks/useViewerStoreEffects';
import { loadViewerPage } from '@/pages/loadViewerPage';
import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

const ViewerPage = lazy(() => loadViewerPage().then((m) => ({ default: m.ViewerPage })));

function Bridge() {
  useMcpBridge();
  return null;
}

function StoreEffects() {
  useViewerStoreEffects();
  return null;
}

export function App() {
  return (
    <ViewerActionsProvider>
      <Bridge />
      <StoreEffects />
      {/* No fallback: the viewer chunk is prefetched from the import screen,
          and a reload of /viewer shows its own restore screen once it lands. */}
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<ImportOverlay />} />
          <Route path="/viewer" element={<ViewerPage />} />
        </Routes>
      </Suspense>
    </ViewerActionsProvider>
  );
}
