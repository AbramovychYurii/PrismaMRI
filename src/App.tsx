import { ImportOverlay } from '@/components/layout/ImportOverlay';
import { ViewerActionsProvider } from '@/hooks/ViewerActionsContext';
import { useMcpBridge } from '@/hooks/useMcpBridge';
import { ViewerPage } from '@/pages/ViewerPage';
import { Route, Routes } from 'react-router-dom';

function Bridge() {
  useMcpBridge();
  return null;
}

export function App() {
  return (
    <ViewerActionsProvider>
      <Bridge />
      <Routes>
        <Route path="/" element={<ImportOverlay />} />
        <Route path="/viewer" element={<ViewerPage />} />
      </Routes>
    </ViewerActionsProvider>
  );
}
