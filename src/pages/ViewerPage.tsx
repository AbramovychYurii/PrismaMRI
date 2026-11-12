import { AppGrid } from '@/components/layout/AppGrid';
import { AgentLockOverlay } from '@/components/mcp/AgentLockOverlay';
import { ConnectConfirm } from '@/components/mcp/ConnectConfirm';
import { ReportAction } from '@/components/mcp/ReportAction';
import { SessionPanel } from '@/components/mcp/SessionPanel';
import { KeyboardShortcutsModal } from '@/components/ui/KeyboardShortcutsModal';
import { useViewerActions } from '@/hooks/ViewerActionsContext';
import * as volumeDb from '@/lib/volumeDb';
import { useAgentStore } from '@/store';
import { type ViewerSlots, useViewerStore } from '@/viewer';
import { useCallback, useEffect, useRef, useState } from 'react';
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

/**
 * What PrismaMRI adds to the viewer: the agent panel and the PDF report.
 * Given here rather than at the app root so they load with the viewer chunk,
 * not with the import screen.
 */
const APP_SLOTS: ViewerSlots = {
  stageOverlay: <SessionPanel />,
  annotationActions: (context) => <ReportAction {...context} />,
  annotationHint: (
    <>
      Click <strong>REPORT</strong> to open the export dialog
    </>
  ),
};

export function ViewerPage() {
  const volumeLoaded = useViewerStore((s) => s.volume !== null);
  const mcpConnected = useAgentStore((s) => s.mcpConnected);
  const restoreVolume = useViewerStore((s) => s.restoreVolume);
  const loadingActive = useViewerStore((s) => s.loading.active);
  const setLoading = useViewerStore((s) => s.setLoading);
  const { showShortcuts, setShowShortcuts } = useViewerActions();
  const navigate = useNavigate();
  const exitToImport = useCallback(() => navigate('/'), [navigate]);

  // Clear the loading flag once the viewer takes over. loadFromSource
  // deliberately leaves it true through the route swap so the example
  // cards stay dimmed until ImportOverlay is fully gone — otherwise the
  // cards visibly un-dim while the heavy AppGrid mount holds the previous
  // frame on screen.
  useEffect(() => {
    if (volumeLoaded && loadingActive) {
      setLoading({ active: false, percent: 100, stage: 'done', message: 'Ready' });
    }
  }, [volumeLoaded, loadingActive, setLoading]);

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
  // Uses `restoreVolume` (not `setVolume`) so the persisted UI state — cursor,
  // W/L, render preset, toolbar — survives the reload instead of getting
  // reset to fresh-import defaults.
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
          restoreVolume(result.volume, result.prepared3D, result.histogram);
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
  }, [volumeLoaded, restoreVolume, navigate]);

  if (restoring) return <RestoreScreen>Restoring volume…</RestoreScreen>;

  return (
    <>
      <AppGrid slots={APP_SLOTS} onExit={exitToImport} />
      {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showConfirm && <ConnectConfirm onClose={() => setShowConfirm(false)} />}
      <AgentLockOverlay />
    </>
  );
}
