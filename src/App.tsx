import { useVolumeStore } from '@/store/volumeStore';
import { ViewerActionsProvider } from '@/hooks/ViewerActionsContext';
import { AppGrid } from '@/components/layout/AppGrid';
import { ImportOverlay } from '@/components/layout/ImportOverlay';

export function App() {
  const view = useVolumeStore((s) => s.view);
  return (
    <ViewerActionsProvider>
      <AppGrid />
      {view === 'import' && <ImportOverlay />}
    </ViewerActionsProvider>
  );
}
