/**
 * SessionPanel
 *
 * Shows one of two panels depending on how the PWA is being used:
 *
 *  • RemoteModePanel — hosted web app, connects via Cloudflare relay.
 *    Shows Session ID, Relay URL, and a one-click .dxt download.
 *
 *  • LocalModePanel  — installed PWA or localhost dev server.
 *    Connects directly to the MCP server on 127.0.0.1; no relay,
 *    no Session ID needed.
 *
 * All visual styling lives in `SessionPanel.styles.ts`. The reference prompt
 * markdown lives in `lib/mcp/example-prompt.ts`. Shared MCP constants
 * (ports, severities, action labels, W/L presets) live in `lib/mcp/constants.ts`.
 */

import { LOCAL_PORTS } from '@/lib/mcp/constants';
import { EXAMPLE_PROMPT } from '@/lib/mcp/example-prompt';
import { getSampleReport } from '@/lib/sampleReports';
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
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ActionBtn,
  type BtnState,
  CapabilitiesToggle,
  CapabilityDot,
  CapabilityGrid,
  CapabilityItem,
  CapabilityText,
  CollapseBtn,
  CopyBtn,
  Divider,
  HeaderIcon,
  Hint,
  HowItWorksBox,
  HowItWorksText,
  HowItWorksTitle,
  InfoBtn,
  InfoBubble,
  Label,
  MinimisedPill,
  OpenClaudeLink,
  Panel,
  PanelBody,
  PanelHeader,
  PromptBox,
  PromptChevron,
  PromptLabel,
  PromptLabelText,
  PromptPreview,
  Row,
  StatusDot,
  StatusText,
  Value,
} from './SessionPanel.styles';

const SERVER_BUNDLE_URL = `${import.meta.env.BASE_URL}dxt-server/index.js`;
const WS_LIB_URL = `${import.meta.env.BASE_URL}dxt-server/ws/`;

/**
 * True only when the app is running as an *installed* PWA (standalone window).
 * Regular browser tabs — including localhost dev — show the Remote panel.
 * The connection layer (useMcpBridge) still tries local WS on localhost
 * independently of which panel is displayed.
 */
function isLocalMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * The .dxt file is a ZIP of `manifest.json` + a server bundle (Node + ws lib),
 * dropped into Claude Desktop via Settings → Extensions → Install Extension.
 */
async function downloadDxt(): Promise<void> {
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
    version: '2.1.0',
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
        env: {},
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
      'set_slab_mm',
      'capture_slice',
      'capture_all_planes',
      'capture_overview_grid',
      'capture_3d',
      'add_annotation',
      'remove_annotation',
      'list_annotations',
      'clear_annotations',
      'set_measurement',
      'get_measurement',
      'clear_measurement',
    ].map((name) => ({ name })),
    compatibility: { claude_desktop: '>=0.10.0', platforms: ['darwin', 'win32', 'linux'] },
  };

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('server/index.js', serverJs);
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

function PromptSection() {
  const [promptOpen, setPromptOpen] = useState(true);
  const [copyState, setCopyState] = useState<BtnState>('idle');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(EXAMPLE_PROMPT);
      setCopyState('ok');
    } catch {
      setCopyState('err');
    } finally {
      setTimeout(() => setCopyState('idle'), 2500);
    }
  }, []);

  return (
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
        onClick={handleCopy}
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
  );
}

//
// Not connected  →  same for Web and PWA: download button + instructions.
// Connected      →  differs by mode:
//   Web (relay)  →  prompt example + disconnect
//   PWA (local)  →  direct connection info + prompt example

// Stable inline-style references (declared at module scope so they don't
// allocate fresh objects every render of the panel).
const LABEL_INLINE_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
};
const PORT_VALUE_INLINE_STYLE: React.CSSProperties = { fontSize: 10.5, opacity: 0.45 };
const STRONG_INK2_STYLE: React.CSSProperties = { color: 'var(--ink-2)' };

export function SessionPanel() {
  const mcpConnected = useVolumeStore((s) => s.mcpConnected);
  const agentWorking = useVolumeStore((s) => s.agentSessionActive);
  const localPort = useVolumeStore((s) => s.localPort);
  const dockOpen = useVolumeStore((s) => s.toolbar.dock);
  const activeVolumeId = useVolumeStore((s) => s.activeVolumeId);
  const setAiAnnotations = useVolumeStore((s) => s.setAiAnnotations);
  // Prefer the store's localPort over isLocalMode() — localPort is set only when
  // the bridge actually connected directly to 127.0.0.1 (covers both PWA standalone
  // and localhost dev-server cases that isLocalMode() would miss).
  const local = localPort !== null || isLocalMode();
  const [expanded, setExpanded] = useState(false);
  const [capOpen, setCapOpen] = useState(false);
  const [dxtState, setDxtState] = useState<BtnState>('idle');
  const [sampleState, setSampleState] = useState<BtnState>('idle');

  // Example-report button is visible only when:
  //  • the agent is not connected (nothing to demo against the real model), AND
  //  • the loaded volume is one of the curated demo files in SAMPLE_REPORTS.
  const sampleReport = getSampleReport(activeVolumeId);

  const handleLoadSample = useCallback(() => {
    if (!sampleReport) return;
    setSampleState('idle');
    try {
      setAiAnnotations(sampleReport.annotations);
      setSampleState('ok');
      // Collapse the panel so the user immediately sees the AnnotationHud
      // entrance animation and the annotated findings on the volume.
      setExpanded(false);
      setTimeout(() => setSampleState('idle'), 3000);
    } catch {
      setSampleState('err');
      setTimeout(() => setSampleState('idle'), 3000);
    }
  }, [sampleReport, setAiAnnotations]);

  const handleDownloadDxt = useCallback(async () => {
    setDxtState('idle');
    try {
      await downloadDxt();
      setDxtState('ok');
      setTimeout(() => setDxtState('idle'), 3000);
    } catch {
      setDxtState('err');
      setTimeout(() => setDxtState('idle'), 3000);
    }
  }, []);

  const toggle = () => setExpanded((o) => !o);

  const pill = (
    <MinimisedPill
      $connected={mcpConnected}
      $working={agentWorking}
      $dockOpen={dockOpen}
      onClick={toggle}
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
        <PanelHeader $connected={mcpConnected} onClick={toggle}>
          <HeaderIcon>
            <Bot size={14} />
          </HeaderIcon>
          <StatusDot $connected={mcpConnected} />
          <StatusText $connected={mcpConnected}>
            {mcpConnected ? 'AI Agent Connected' : 'Waiting for Agent'}
          </StatusText>
          <CollapseBtn type="button" aria-label="Collapse panel">
            <X size={14} />
          </CollapseBtn>
        </PanelHeader>

        <PanelBody>
          {!mcpConnected && (
            <>
              <HowItWorksBox>
                <HowItWorksTitle>How it works</HowItWorksTitle>
                <HowItWorksText>
                  Install the extension once — Claude Desktop connects to this viewer automatically
                  and gets full control over navigation, windowing, and annotations. No data leaves
                  your machine.
                </HowItWorksText>
              </HowItWorksBox>

              <HowItWorksBox>
                <CapabilitiesToggle
                  type="button"
                  onClick={() => setCapOpen((o) => !o)}
                  aria-expanded={capOpen}
                >
                  <HowItWorksTitle>What Claude can do</HowItWorksTitle>
                  <PromptChevron $open={capOpen}>
                    <ChevronDown size={11} />
                  </PromptChevron>
                </CapabilitiesToggle>

                {capOpen && (
                  <CapabilityGrid>
                    <CapabilityItem>
                      <CapabilityDot />
                      <CapabilityText>Navigate slices &amp; planes</CapabilityText>
                    </CapabilityItem>
                    <CapabilityItem>
                      <CapabilityDot />
                      <CapabilityText>Capture 2-D &amp; 3-D views</CapabilityText>
                    </CapabilityItem>
                    <CapabilityItem>
                      <CapabilityDot />
                      <CapabilityText>Detect &amp; annotate findings</CapabilityText>
                    </CapabilityItem>
                    <CapabilityItem>
                      <CapabilityDot />
                      <CapabilityText>Full systematic scan review</CapabilityText>
                    </CapabilityItem>
                    <CapabilityItem>
                      <CapabilityDot />
                      <CapabilityText>Adjust W/L &amp; presets</CapabilityText>
                    </CapabilityItem>
                    <CapabilityItem>
                      <CapabilityDot />
                      <CapabilityText>Slab MIP &amp; measurements</CapabilityText>
                    </CapabilityItem>
                  </CapabilityGrid>
                )}
              </HowItWorksBox>

              <Divider />

              <ActionBtn type="button" $primary $state={dxtState} onClick={handleDownloadDxt}>
                {dxtState === 'ok' ? (
                  <Check size={13} />
                ) : dxtState === 'err' ? (
                  <X size={13} />
                ) : (
                  <Download size={13} />
                )}
                {dxtState === 'ok'
                  ? 'Downloaded!'
                  : dxtState === 'err'
                    ? 'Download failed'
                    : 'Download Claude Desktop Extension'}
              </ActionBtn>
              <Hint>
                Then open{' '}
                <OpenClaudeLink
                  href="claude://"
                  target="_blank"
                  rel="noopener"
                  title="Open Claude Desktop"
                >
                  Claude Desktop
                </OpenClaudeLink>{' '}
                → Settings → <strong style={STRONG_INK2_STYLE}>Extensions</strong> → Install
                Extension. Claude connects to this viewer automatically.
              </Hint>

              {sampleReport && (
                <>
                  <Divider />
                  <ActionBtn type="button" $state={sampleState} onClick={handleLoadSample}>
                    {sampleState === 'ok' ? (
                      <Check size={13} />
                    ) : sampleState === 'err' ? (
                      <X size={13} />
                    ) : (
                      <Sparkles size={13} />
                    )}
                    {sampleState === 'ok'
                      ? 'Example loaded!'
                      : sampleState === 'err'
                        ? 'Could not load example'
                        : 'Show example AI report'}
                  </ActionBtn>
                  <Hint>
                    Loads a pre-recorded AI analysis of this sample volume so you can preview the
                    annotated findings without installing the extension. Replaces any existing
                    findings for this file.
                  </Hint>
                </>
              )}
            </>
          )}

          {mcpConnected && local && (
            <>
              <Row>
                <Label style={LABEL_INLINE_STYLE}>
                  <Zap size={10} />
                  Direct connection
                  <InfoTip text="Claude connects directly to this app with no relay — no data leaves your machine. Lower latency, works offline." />
                </Label>
                <Value style={PORT_VALUE_INLINE_STYLE}>
                  {localPort
                    ? `PORT: ${localPort}`
                    : `PORT: ${LOCAL_PORTS[0]}–${LOCAL_PORTS[LOCAL_PORTS.length - 1]}`}
                </Value>
              </Row>
              <PromptSection />
            </>
          )}
        </PanelBody>
      </Panel>
    </>
  );
}
