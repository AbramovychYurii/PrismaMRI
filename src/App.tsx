import { AppGrid } from '@/components/layout/AppGrid';
import { ImportOverlay } from '@/components/layout/ImportOverlay';
import { AgentLockOverlay } from '@/components/mcp/AgentLockOverlay';
import { AnnotationHud } from '@/components/mcp/AnnotationHud';
import { ConnectConfirm } from '@/components/mcp/ConnectConfirm';
import { KeyboardShortcutsModal } from '@/components/ui/KeyboardShortcutsModal';
import { ViewerActionsProvider, useViewerActions } from '@/hooks/ViewerActionsContext';
import { useMcpBridge } from '@/hooks/useMcpBridge';
import { useSessionId } from '@/hooks/useSessionId';
import { useVolumeStore } from '@/store/volumeStore';
import { useEffect, useRef, useState } from 'react';

function AppInner({ sessionId }: { sessionId: string | null }) {
  const view = useVolumeStore((s) => s.view);
  const mcpConnected = useVolumeStore((s) => s.mcpConnected);
  const { showShortcuts, setShowShortcuts } = useViewerActions();

  // Track when agent first connects so we can show the confirm dialog once.
  const prevConnected = useRef(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (mcpConnected && !prevConnected.current) {
      setShowConfirm(true);
    }
    prevConnected.current = mcpConnected;
  }, [mcpConnected]);

  // Start the relay WebSocket bridge (no-op when RELAY_URL is absent).
  useMcpBridge(sessionId);

  return (
    <>
      <AppGrid />
      {view === 'import' && <ImportOverlay />}
      {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showConfirm && <ConnectConfirm onClose={() => setShowConfirm(false)} />}
      <AnnotationHud />
      <AgentLockOverlay />
    </>
  );
}

export function App() {
  const sessionId = useSessionId();

  return (
    <ViewerActionsProvider>
      <AppInner sessionId={sessionId} />
    </ViewerActionsProvider>
  );
}
