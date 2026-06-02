import { AppGrid } from '@/components/layout/AppGrid';
import { AgentLockOverlay } from '@/components/mcp/AgentLockOverlay';
import { ConnectConfirm } from '@/components/mcp/ConnectConfirm';
import { KeyboardShortcutsModal } from '@/components/ui/KeyboardShortcutsModal';
import { useViewerActions } from '@/hooks/ViewerActionsContext';
import * as volumeDb from '@/lib/volumeDb';
import { useVolumeStore } from '@/store/volumeStore';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

const RestoreScreen = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--bg);
  color: var(--ink-3);
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
`;

export function ViewerPage() {
  const volumeLoaded = useVolumeStore((s) => s.volume !== null);
  const mcpConnected = useVolumeStore((s) => s.mcpConnected);
  const setVolume = useVolumeStore((s) => s.setVolume);
  const { showShortcuts, setShowShortcuts } = useViewerActions();
  const navigate = useNavigate();

  const confirmedOnce = useRef(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [restoring, setRestoring] = useState(!volumeLoaded);

  useEffect(() => {
    if (mcpConnected && volumeLoaded && !confirmedOnce.current) {
      confirmedOnce.current = true;
      setShowConfirm(true);
    }
  }, [mcpConnected, volumeLoaded]);

  // On mount: if no volume is in memory, try IndexedDB restore.
  // setVolume and navigate are stable refs; volumeLoaded triggers re-check after restore.
  useEffect(() => {
    if (volumeLoaded) {
      setRestoring(false);
      return;
    }

    let alive = true;
    setRestoring(true);

    volumeDb
      .loadVolume()
      .then((result) => {
        if (!alive) return;
        if (result) {
          setVolume(result.volume, result.prepared3D, result.histogram);
          setRestoring(false);
        } else {
          navigate('/', { replace: true });
        }
      })
      .catch(() => {
        if (alive) navigate('/', { replace: true });
      });

    return () => {
      alive = false;
    };
  }, [volumeLoaded, setVolume, navigate]);

  if (restoring) return <RestoreScreen>Restoring volume…</RestoreScreen>;

  return (
    <>
      <AppGrid />
      {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showConfirm && <ConnectConfirm onClose={() => setShowConfirm(false)} />}
      <AgentLockOverlay />
    </>
  );
}
