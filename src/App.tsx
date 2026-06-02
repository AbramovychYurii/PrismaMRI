import { ImportOverlay } from '@/components/layout/ImportOverlay';
import { ViewerActionsProvider } from '@/hooks/ViewerActionsContext';
import { useMcpBridge } from '@/hooks/useMcpBridge';
import { useSessionId } from '@/hooks/useSessionId';
import { ViewerPage } from '@/pages/ViewerPage';
import { Route, Routes } from 'react-router-dom';

function Bridge() {
  const sessionId = useSessionId();
  useMcpBridge(sessionId);
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
