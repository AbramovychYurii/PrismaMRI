import { AppGrid } from '@/components/layout/AppGrid';
import { ImportOverlay } from '@/components/layout/ImportOverlay';
import { AgentLockOverlay } from '@/components/mcp/AgentLockOverlay';
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
  const volumeLoaded = useVolumeStore((s) => s.volume !== null);
  const { showShortcuts, setShowShortcuts } = useViewerActions();

  // Show the confirm dialog only once per page load, and only when both the
  // agent is connected AND a volume is open (no point showing it on the
  // landing page before the user has loaded any scan).
  const confirmedOnce = useRef(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (mcpConnected && volumeLoaded && !confirmedOnce.current) {
      confirmedOnce.current = true;
      setShowConfirm(true);
    }
  }, [mcpConnected, volumeLoaded]);

  // Start the relay WebSocket bridge (no-op when RELAY_URL is absent).
  useMcpBridge(sessionId);

  return (
    <>
      <AppGrid />
      {view === 'import' && <ImportOverlay />}
      {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showConfirm && <ConnectConfirm onClose={() => setShowConfirm(false)} />}
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
