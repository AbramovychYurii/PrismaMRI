import { AppGrid } from '@/components/layout/AppGrid';
import { ImportOverlay } from '@/components/layout/ImportOverlay';
import { ViewerActionsProvider } from '@/hooks/ViewerActionsContext';
import { useVolumeStore } from '@/store/volumeStore';

export function App() {
  const view = useVolumeStore((s) => s.view);
  return (
    <ViewerActionsProvider>
      <AppGrid />
      {view === 'import' && <ImportOverlay />}
    </ViewerActionsProvider>
  );
}
