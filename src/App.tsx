import { AppGrid } from '@/components/layout/AppGrid';
import { ImportOverlay } from '@/components/layout/ImportOverlay';
import { KeyboardShortcutsModal } from '@/components/ui/KeyboardShortcutsModal';
import { ViewerActionsProvider, useViewerActions } from '@/hooks/ViewerActionsContext';
import { useVolumeStore } from '@/store/volumeStore';

function AppInner() {
  const view = useVolumeStore((s) => s.view);
  const { showShortcuts, setShowShortcuts } = useViewerActions();
  return (
    <>
      <AppGrid />
      {view === 'import' && <ImportOverlay />}
      {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </>
  );
}

export function App() {
  return (
    <ViewerActionsProvider>
      <AppInner />
    </ViewerActionsProvider>
  );
}
