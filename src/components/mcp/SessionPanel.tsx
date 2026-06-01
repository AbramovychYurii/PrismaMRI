/**
 * SessionPanel
 *
 * Floating panel (bottom-right) with two ways to push the MCP config into
 * Claude Desktop:
 *
 *  1. "Update Config File" — uses the File System Access API to let the user
 *     pick claude_desktop_config.json, reads it, merges the prismamri entry,
 *     and writes it back in one click. No terminal needed.
 *
 *  2. "Copy JSON" — classic clipboard fallback for browsers that don't support
 *     the File System Access API (Firefox, Safari).
 */

import { DOCK_H } from '@/components/dock/Dock';
import { useSessionId } from '@/hooks/useSessionId';
import { useVolumeStore } from '@/store/volumeStore';
import JSZip from 'jszip';
import {
  Bot,
  Check,
  ChevronDown,
  Clipboard,
  ClipboardCheck,
  Download,
  Info,
  Link2,
  Unplug,
  X,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes } from 'styled-components';

const RELAY_URL = import.meta.env.VITE_RELAY_URL as string | undefined;

/** URL of the pre-built server bundle shipped with the app.
 * Use import.meta.env.BASE_URL (e.g. "/PrismaMRI/" on GitHub Pages, "/" locally)
 * so the path is correct regardless of the deployment sub-directory. */
const SERVER_BUNDLE_URL = `${import.meta.env.BASE_URL}dxt-server/index.js`;
const WS_LIB_URL = `${import.meta.env.BASE_URL}dxt-server/ws/`;

/**
 * Fetch the pre-built server bundle + ws lib, inject the session/relay into
 * manifest.json, and download as a personalised prismamri.dxt the user can
 * drag straight into Claude Desktop → Extensions.
 */
async function downloadDxt(sessionId: string, relayUrl: string): Promise<void> {
  const [serverJs, wsIndex, wsLib] = await Promise.all([
    fetch(SERVER_BUNDLE_URL).then((r) => r.arrayBuffer()),
    fetch(`${WS_LIB_URL}index.js`).then((r) => r.text()),
    Promise.all(
      [
        'constants.js',
        'event-target.js',
        'buffer-util.js',
        'extension.js',
        'limiter.js',
        'permessage-deflate.js',
        'receiver.js',
        'sender.js',
        'stream.js',
        'subprotocol.js',
        'validation.js',
        'websocket.js',
        'websocket-server.js',
      ].map((f) =>
        fetch(`${WS_LIB_URL}lib/${f}`)
          .then((r) => r.text())
          .then((t) => ({ name: f, text: t })),
      ),
    ),
  ]);

  const manifest = {
    dxt_version: '0.1',
    name: 'prismamri',
    display_name: 'PrismaMRI AI Agent',
    version: '2.0.0',
    description:
      'Navigate MRI slices, analyze findings, place annotations and capture images — all controlled by Claude.',
    author: { name: 'PrismaMRI' },
    license: 'MIT',
    server: {
      type: 'node',
      entry_point: 'server/index.js',
      mcp_config: {
        command: 'node',
        args: ['${__dirname}/server/index.js'],
        env: {
          PRISMAMRI_SESSION: sessionId,
          PRISMAMRI_RELAY_URL: relayUrl,
        },
      },
    },
    tools: [
      'get_viewer_state',
      'get_volume_overview',
      'navigate_to_slice',
      'step_slice',
      'navigate_to_center',
      'set_window_level',
      'apply_wl_preset',
      'set_render_preset',
      'capture_slice',
      'capture_all_planes',
      'capture_overview_grid',
      'capture_3d',
      'add_annotation',
      'remove_annotation',
      'list_annotations',
      'clear_annotations',
    ].map((name) => ({ name })),
    compatibility: { claude_desktop: '>=0.10.0', platforms: ['darwin', 'win32', 'linux'] },
  };

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('server/index.js', serverJs);
  // ws (only external dep — not bundled by esbuild)
  zip.file('server/node_modules/ws/index.js', wsIndex);
  for (const { name, text } of wsLib) {
    zip.file(`server/node_modules/ws/lib/${name}`, text);
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'prismamri.dxt';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Styled components ────────────────────────────────────────────────────────

const Panel = styled.div<{ $dockOpen: boolean }>`
  position: fixed;
  bottom: ${({ $dockOpen }) => ($dockOpen ? DOCK_H + 18 : 18)}px;
  right: 18px;
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  width: 364px;
  background: rgba(14, 12, 9, 0.97);
  border: 1px solid var(--rule);
  border-radius: 10px;
  backdrop-filter: blur(14px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65);
  overflow: hidden;
  font-family: var(--mono);
  transition: bottom 260ms ease;

  @media (max-width: 767px) {
    width: calc(100vw - 24px);
    bottom: ${({ $dockOpen }) => ($dockOpen ? DOCK_H + 12 : 12)}px;
    right: 12px;
  }
`;

const PanelHeader = styled.div<{ $connected: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: ${({ $connected }) =>
    $connected ? 'rgba(80,200,120,0.06)' : 'rgba(255,255,255,0.02)'};
  border-bottom: 1px solid var(--rule);
  cursor: pointer;
  user-select: none;
  transition: background 200ms;
  &:hover {
    background: ${({ $connected }) =>
      $connected ? 'rgba(80,200,120,0.10)' : 'rgba(255,255,255,0.04)'};
  }
`;

const pulse = keyframes`
  0%,100% { opacity:1; }
  50%      { opacity:0.35; }
`;

const borderGlow = keyframes`
  0%,100% {
    box-shadow: 0 0 0 0 rgba(80,200,120,0), 0 4px 16px rgba(0,0,0,0.5);
    border-color: rgba(80,200,120,0.55);
  }
  50% {
    box-shadow: 0 0 10px 2px rgba(80,200,120,0.45), 0 4px 16px rgba(0,0,0,0.5);
    border-color: rgba(80,200,120,0.95);
  }
`;

const StatusDot = styled.span<{ $connected: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $connected }) => ($connected ? '#50c878' : 'var(--ink-3)')};
  animation: ${({ $connected }) => ($connected ? pulse : 'none')} 2s ease-in-out infinite;
`;

const StatusText = styled.span<{ $connected: boolean }>`
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ $connected }) => ($connected ? '#50c878' : 'var(--ink-2)')};
  flex: 1;
`;

const HeaderIcon = styled.div`
  color: var(--ink-3);
  display: flex;
  align-items: center;
`;

const CollapseBtn = styled.button`
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--ink-3);
  display: flex;
  align-items: center;
  &:hover { color: var(--ink); }
`;

const PanelBody = styled.div`
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Row = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Label = styled.span`
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-3);
`;

const SessionId = styled.span`
  font-size: 11.5px;
  letter-spacing: 0.04em;
  color: var(--ink-2);
  word-break: break-all;
`;

type BtnState = 'idle' | 'ok' | 'err';

const ActionBtn = styled.button<{ $state?: BtnState; $primary?: boolean; $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 12px;
  border-radius: 6px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 140ms;
  width: 100%;
  justify-content: center;

  ${({ $state, $primary, $danger }) => {
    if ($state === 'ok')
      return `
        border: 1px solid var(--teal-dim);
        background: rgba(0,180,150,0.08);
        color: var(--teal);
      `;
    if ($state === 'err')
      return `
        border: 1px solid rgba(255,80,80,0.4);
        background: rgba(255,80,80,0.06);
        color: #ff6060;
      `;
    if ($primary)
      return `
        border: 1px solid rgba(80,200,120,0.35);
        background: rgba(80,200,120,0.07);
        color: #50c878;
        &:hover { background: rgba(80,200,120,0.13); border-color: rgba(80,200,120,0.6); }
      `;
    if ($danger)
      return `
        border: 1px solid rgba(255,181,71,0.35);
        background: rgba(255,181,71,0.06);
        color: var(--amber);
        &:hover { background: rgba(255,181,71,0.12); border-color: rgba(255,181,71,0.6); }
      `;
    return `
      border: 1px solid var(--rule);
      background: rgba(255,255,255,0.03);
      color: var(--ink-2);
      &:hover { border-color: var(--rule-2); color: var(--ink); }
    `;
  }}
`;

const Hint = styled.p`
  font-size: 10px;
  color: var(--ink-3);
  line-height: 1.6;
  margin: 0;
`;

// ── InfoTip — multi-line hover tooltip via portal ────────────────────────────

const InfoBubble = styled.div<{ $x: number; $y: number }>`
  position: fixed;
  left: ${({ $x }) => $x}px;
  top: ${({ $y }) => $y}px;
  transform: translate(-100%, -50%);
  z-index: var(--z-popover);
  width: 242px;
  background: rgba(18, 16, 12, 0.97);
  border: 1px solid var(--rule-2);
  border-radius: 6px;
  padding: 8px 10px;
  font-family: var(--mono);
  font-size: 10px;
  line-height: 1.6;
  color: var(--ink-3);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.65);
  pointer-events: none;
  animation: _tip-in 80ms ease forwards;
  @keyframes _tip-in { from { opacity: 0 } to { opacity: 1 } }
`;

const InfoBtn = styled.button`
  background: none;
  border: none;
  padding: 0;
  margin-left: 2px;
  cursor: default;
  color: var(--ink-3);
  display: inline-flex;
  align-items: center;
  line-height: 1;
  &:hover { color: var(--ink-2); }
`;

function InfoTip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  function show() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: r.left - 6, y: r.top + r.height / 2 });
  }

  return (
    <>
      <InfoBtn
        ref={ref}
        type="button"
        aria-label="More info"
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
      >
        <Info size={10} />
      </InfoBtn>
      {pos &&
        createPortal(
          <InfoBubble $x={pos.x} $y={pos.y}>
            {text}
          </InfoBubble>,
          document.body,
        )}
    </>
  );
}

const BetaBadge = styled.span`
  font-size: 8.5px;
  font-family: var(--mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 1.5px 5px;
  border-radius: 3px;
  border: 1px solid rgba(255, 181, 71, 0.35);
  background: rgba(255, 181, 71, 0.08);
  color: var(--amber);
  line-height: 1;
  flex-shrink: 0;
`;

const MinimisedPill = styled.button<{
  $connected: boolean;
  $working: boolean;
  $dockOpen: boolean;
}>`
  /* Anchored inside the 3-D Stage section (its parent has position:relative).
     The expanded Panel switches to position:fixed so it slides out to the
     viewport edge instead of the stage edge. Sizing mirrors the ToolbarPill
     ToolBtn (top-right of the stage) so all stage chrome shares the same
     visual weight. Lifts above the Dock when it's open. */
  position: absolute;
  bottom: ${({ $dockOpen }) => ($dockOpen ? DOCK_H + 22 : 22)}px;
  right: 30px;
  z-index: var(--z-dock-ui);
  transition: bottom 260ms ease, color 120ms, background 120ms, border-color 120ms;
  display: inline-flex;
  align-items: center;
  padding: 12px;
  border-radius: 999px;
  border: 1px solid ${({ $connected, $working }) =>
    $working ? 'rgba(80,200,120,0.55)' : $connected ? 'rgba(80,200,120,0.35)' : 'var(--rule)'};
  background: ${({ $working }) => ($working ? 'rgba(14,12,9,0.97)' : 'rgba(20, 18, 14, 0.85)')};
  backdrop-filter: blur(8px);
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ $connected }) => ($connected ? '#50c878' : 'var(--ink-2)')};
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  animation: ${({ $working }) => ($working ? borderGlow : 'none')} 2s ease-in-out infinite;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    border-color: ${({ $connected }) => ($connected ? 'rgba(80,200,120,0.6)' : 'var(--rule-2)')};
    color: ${({ $connected }) => ($connected ? '#70d898' : 'var(--ink)')};
    background: ${({ $working }) => ($working ? 'rgba(20,18,13,0.97)' : 'rgba(28, 24, 18, 0.92)')};
  }

  @media (max-width: 767px) {
    /* Mobile has no Dock — ignore $dockOpen and pin near the tab bar. */
    bottom: 12px;
    right: 12px;
  }
`;

// ── Prompt example ────────────────────────────────────────────────────────────

/**
 * Ready-to-paste prompt that demonstrates the full PrismaMRI AI-agent workflow.
 * Kept as a plain string so it's easy to update without touching JSX.
 */
const EXAMPLE_PROMPT = `Using the PrismaMRI tools, perform a systematic review of the medical volume currently open in the viewer and produce a structured report.

> ⚠️ Research and educational use only — not a substitute for clinical judgment.

## Step 1 · Verify the volume
Call \`get_viewer_state\`. If \`volumeLoaded\` is false, stop and ask the user to open a file first.
Note the modality (CT or MRI), dims, and spacing — they guide every decision below.

## Step 2 · Get an overview
Call \`get_volume_overview\` to receive metadata and centre-slice PNGs of all three planes.
Based on the modality, apply a contrast preset before step 3:
- CT → \`apply_wl_preset\` "bone" (skeletal) or "soft_tissue" (organs/vessels)
- MRI → \`apply_wl_preset\` "t1", "t2", or "flair" matching the sequence protocol

## Step 3 · Survey all three planes
For each plane (coronal → sagittal → axial):
1. Call \`capture_overview_grid\` with \`count=6\` — six evenly-spaced thumbnails give you the full anatomy at a glance before zooming in.
2. Identify 2–3 slices that deserve closer inspection.
3. Call \`navigate_to_slice\`, then \`capture_slice\` (with \`slab_mm=5\` for a MIP slab on CT) to get a high-detail PNG of each region of interest.
4. For every genuine abnormality you see in the captured image, place a marker immediately (see "Marking a finding" below) — don't wait until the end.

### Marking a finding
Look at the PNG you just captured and estimate where the abnormality sits:
- \`fx\` = horizontal position ÷ image width  (0 = left edge, 1 = right edge)
- \`fy\` = vertical position ÷ image height  (0 = top edge, 1 = bottom edge)

Then call \`add_annotation\` with:
- \`plane\` — the plane you were viewing when you captured the image
- \`fx\`, \`fy\` — position fractions as above
- \`severity\` — one of:
  - 🔴 \`critical\` — urgent, requires immediate attention
  - 🟠 \`serious\` — significant, needs timely follow-up
  - 🟡 \`moderate\` — mild, monitor at next visit
  - 🟢 \`comment\` — incidental / informational note, no danger
- \`label\` — concise anatomical name of the finding (≤ 5 words)
- \`summary\` — 1–3 sentences: what you see, size if measurable, clinical relevance

Only annotate genuine abnormalities or clinically notable incidental findings. Do not mark normal anatomy.

## Step 4 · 3-D capture
Call \`set_render_preset\`:
- "bone" — CT skeletal studies (recommended for most CT)
- "tissue" — soft-tissue or MRI volumes
- "mip" — angiography / airways

Then call \`capture_3d\`. The returned PNG shows all colour-coded markers on the model.

## Step 5 · Report
Present the final report in this format:

**Technique** — modality, dims, spacing, preset used.

**Findings** — list each finding by anatomical region, most severe first; include voxel location, size, and severity level.

**Impression** — 2–4 sentence summary of the most important conclusions.

**Recommendations** — suggested next steps: follow-up imaging, specialist referral, urgency.`;

// ── Styled components (prompt section) ───────────────────────────────────────

const Divider = styled.div`
  height: 1px;
  background: var(--rule);
  margin: 2px 0;
`;

const PromptBox = styled.div`
  position: relative;
  border: 1px solid var(--rule);
  border-radius: 6px;
  overflow: hidden;
`;

const PromptLabel = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 10px 6px;
  background: rgba(255,255,255,0.02);
  border: none;
  border-bottom: 1px solid var(--rule);
  cursor: pointer;
  text-align: left;
  &:hover { background: rgba(255,255,255,0.05); }
  transition: background 120ms;
`;

const PromptChevron = styled.span<{ $open: boolean }>`
  display: flex;
  align-items: center;
  color: var(--ink-3);
  transition: transform 200ms ease;
  transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
`;

const PromptLabelText = styled.span`
  font-size: 9.5px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-3);
`;

const PromptPreview = styled.pre`
  margin: 0;
  padding: 9px 10px;
  font-family: var(--mono);
  font-size: 9px;
  line-height: 1.55;
  color: var(--ink-3);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;

  /* Thin dark scrollbar */
  scrollbar-width: thin;
  scrollbar-color: var(--rule-2) transparent;
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb {
    background: var(--rule-2);
    border-radius: 2px;
  }
  &::-webkit-scrollbar-thumb:hover { background: var(--ink-3); }
`;

const CopyBtn = styled.button<{ $state: 'idle' | 'ok' | 'err' }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 6px;
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  cursor: pointer;
  width: 100%;
  justify-content: center;
  transition: all 140ms;

  ${({ $state }) => {
    if ($state === 'ok')
      return `
        border: 1px solid rgba(127,209,197,0.45);
        background: rgba(127,209,197,0.07);
        color: var(--teal);
      `;
    if ($state === 'err')
      return `
        border: 1px solid rgba(255,80,80,0.35);
        background: rgba(255,80,80,0.05);
        color: #ff6060;
      `;
    return `
      border: 1px solid var(--rule);
      background: rgba(255,255,255,0.03);
      color: var(--ink-2);
      &:hover { border-color: var(--rule-2); color: var(--ink); background: rgba(255,255,255,0.05); }
    `;
  }}
`;

// ── Component ────────────────────────────────────────────────────────────────

export function SessionPanel() {
  const sessionId = useSessionId();
  const mcpConnected = useVolumeStore((s) => s.mcpConnected);
  const agentWorking = useVolumeStore((s) => s.agentSessionActive);
  const dockOpen = useVolumeStore((s) => s.toolbar.dock);
  const [expanded, setExpanded] = useState(false);
  const [dxtState, setDxtState] = useState<BtnState>('idle');
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const [promptOpen, setPromptOpen] = useState(true);

  // ── Copy prompt example ─────────────────────────────────────────────────
  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(EXAMPLE_PROMPT);
      setCopyState('ok');
    } catch {
      setCopyState('err');
    } finally {
      setTimeout(() => setCopyState('idle'), 2500);
    }
  }, []);

  // ── .dxt download ───────────────────────────────────────────────────────
  const handleDownloadDxt = useCallback(async () => {
    if (!RELAY_URL || !sessionId) return;
    setDxtState('idle');
    try {
      await downloadDxt(sessionId, RELAY_URL);
      setDxtState('ok');
      setTimeout(() => setDxtState('idle'), 3000);
    } catch {
      setDxtState('err');
      setTimeout(() => setDxtState('idle'), 3000);
    }
  }, [sessionId]);

  if (!RELAY_URL || !sessionId) return null;

  const pill = (
    <MinimisedPill
      $connected={mcpConnected}
      $working={agentWorking}
      $dockOpen={dockOpen}
      onClick={() => setExpanded((o) => !o)}
      aria-expanded={expanded}
      aria-label={agentWorking ? 'AI Working' : mcpConnected ? 'AI Agent Connected' : 'AI Agent'}
    >
      <Bot size={20} />
    </MinimisedPill>
  );

  if (!expanded) return pill;

  return (
    <>
      {pill}
      <Panel $dockOpen={dockOpen} role="complementary" aria-label="AI agent session panel">
        <PanelHeader $connected={mcpConnected} onClick={() => setExpanded(false)}>
          <HeaderIcon>
            <Bot size={14} />
          </HeaderIcon>
          <StatusDot $connected={mcpConnected} />
          <StatusText $connected={mcpConnected}>
            {mcpConnected ? 'AI Agent Connected' : 'Waiting for Agent'}
          </StatusText>
          <BetaBadge>Beta</BetaBadge>
          <CollapseBtn type="button" aria-label="Collapse panel">
            <X size={14} />
          </CollapseBtn>
        </PanelHeader>

        <PanelBody>
          <Row>
            <Label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              Session ID
              <InfoTip text="Tied to the downloaded .dxt extension — Claude uses this ID to find your viewer. If you regenerate the session, download a new .dxt and reinstall it in Claude Desktop." />
            </Label>
            <SessionId>{sessionId}</SessionId>
          </Row>

          {/* ── ① Download .dxt — hidden once agent is connected ── */}
          {!mcpConnected && (
            <>
              <ActionBtn type="button" $primary $state={dxtState} onClick={handleDownloadDxt}>
                {dxtState === 'ok' ? (
                  <Check size={13} />
                ) : dxtState === 'err' ? (
                  <X size={13} />
                ) : (
                  <Download size={13} />
                )}
                {dxtState === 'ok'
                  ? 'Downloaded! Drag into Claude Desktop'
                  : dxtState === 'err'
                    ? 'Download failed'
                    : 'Download for Claude Desktop (.dxt)'}
              </ActionBtn>
              <Hint>
                Drag the downloaded file into Claude Desktop → Extensions, or click{' '}
                <strong style={{ color: 'var(--ink-2)' }}>Install Extension</strong>. Your Session
                ID is already embedded — no extra config needed.
              </Hint>
            </>
          )}

          <Row style={{ gap: 6, marginTop: 2 }}>
            <Label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Link2 size={10} />
              Relay
              <InfoTip text="Lightweight WebSocket bridge that links Claude Desktop to this browser tab — no data is stored or logged. Commands travel directly between Claude and the viewer; the relay only forwards them." />
            </Label>
            <SessionId style={{ fontSize: 9.5, opacity: 0.55 }}>{RELAY_URL}</SessionId>
          </Row>

          {/* ── ② Prompt example — only shown once the agent is connected ── */}
          {mcpConnected && (
            <>
              <Divider />
              <PromptBox>
                <PromptLabel
                  type="button"
                  aria-expanded={promptOpen}
                  onClick={() => setPromptOpen((o) => !o)}
                >
                  <PromptLabelText>Prompt example</PromptLabelText>
                  <PromptChevron $open={promptOpen}>
                    <ChevronDown size={12} />
                  </PromptChevron>
                </PromptLabel>
                {promptOpen && <PromptPreview aria-hidden="true">{EXAMPLE_PROMPT}</PromptPreview>}
              </PromptBox>
              <CopyBtn
                type="button"
                $state={copyState}
                onClick={handleCopyPrompt}
                aria-label="Copy prompt example to clipboard"
              >
                {copyState === 'ok' ? <ClipboardCheck size={13} /> : <Clipboard size={13} />}
                {copyState === 'ok'
                  ? 'Copied! Paste into Claude'
                  : copyState === 'err'
                    ? 'Copy failed — try manually'
                    : 'Copy prompt example'}
              </CopyBtn>
            </>
          )}

          {mcpConnected && (
            <ActionBtn
              type="button"
              $danger
              onClick={() => {
                const ok = window.confirm(
                  'Disconnect the current agent?\n\n' +
                    'This ends the live session with Claude Desktop and ' +
                    'invalidates the .dxt extension you already installed. ' +
                    "To reconnect, you'll need to download a fresh .dxt and " +
                    'reinstall it in Claude Desktop → Extensions.',
                );
                if (!ok) return;
                const id = crypto.randomUUID();
                localStorage.setItem('prismamri-session-id', id);
                window.location.reload();
              }}
              title="End the live session and disconnect the current Claude Desktop agent"
            >
              <Unplug size={12} />
              Disconnect agent
            </ActionBtn>
          )}
        </PanelBody>
      </Panel>
    </>
  );
}
