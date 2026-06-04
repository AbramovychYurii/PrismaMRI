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
 */

import { DOCK_H } from '@/components/dock/Dock';
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
import styled, { keyframes } from 'styled-components';

// ── Environment ───────────────────────────────────────────────────────────────

const SERVER_BUNDLE_URL = `${import.meta.env.BASE_URL}dxt-server/index.js`;
const WS_LIB_URL = `${import.meta.env.BASE_URL}dxt-server/ws/`;

/** Ports the MCP server tries in order. Must match mcp-server/src/index.ts. */
const LOCAL_PORTS = [7389, 7390, 7391, 7392, 7393];

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

// ── .dxt download ─────────────────────────────────────────────────────────────

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

// ── Shared styled components ──────────────────────────────────────────────────

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

export const Panel = styled.div<{ $dockOpen: boolean }>`
  position: fixed;
  bottom: ${({ $dockOpen }) => ($dockOpen ? DOCK_H + 18 : 18)}px;
  right: 18px;
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  width: 370px;
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

export const PanelHeader = styled.div<{ $connected: boolean }>`
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

export const StatusDot = styled.span<{ $connected: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $connected }) => ($connected ? '#50c878' : 'var(--ink-3)')};
  animation: ${({ $connected }) => ($connected ? pulse : 'none')} 2s ease-in-out infinite;
`;

export const StatusText = styled.span<{ $connected: boolean }>`
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

export const PanelBody = styled.div`
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

const Value = styled.span`
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

const OpenClaudeLink = styled.a`
  color: var(--ink-2);
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-color: rgba(255,255,255,0.2);
  cursor: pointer;
  transition: color 120ms, text-decoration-color 120ms;
  &:hover {
    color: var(--ink);
    text-decoration-color: rgba(255,255,255,0.5);
  }
`;

const Divider = styled.div`
  height: 1px;
  background: var(--rule);
  margin: 2px 0;
`;

const HowItWorksBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const HowItWorksTitle = styled.span`
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-3);
`;

const HowItWorksText = styled.p`
  margin: 0;
  font-size: 10px;
  color: var(--ink-3);
  line-height: 1.6;
`;

const CapabilitiesToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--ink-3);
  &:hover { color: var(--ink-2); }
`;

const CapabilityGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
`;

const CapabilityItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding: 5px 7px;
  border-radius: 5px;
  border: 1px solid var(--rule);
  background: rgba(255,255,255,0.02);
`;

const CapabilityDot = styled.span`
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #50c878;
  flex-shrink: 0;
  margin-top: 3px;
`;

const CapabilityText = styled.span`
  font-size: 9px;
  color: var(--ink-3);
  line-height: 1.45;
  letter-spacing: 0.02em;
`;

// ── InfoTip ───────────────────────────────────────────────────────────────────

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

// ── MinimisedPill ─────────────────────────────────────────────────────────────

const MinimisedPill = styled.button<{ $connected: boolean; $working: boolean; $dockOpen: boolean }>`
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
  background: ${({ $working }) => ($working ? 'rgba(14,12,9,0.97)' : 'rgba(20,18,14,0.85)')};
  backdrop-filter: blur(8px);
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ $connected }) => ($connected ? '#50c878' : 'var(--ink-2)')};
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  animation: ${({ $working }) => ($working ? borderGlow : 'none')} 2s ease-in-out infinite;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    border-color: ${({ $connected }) => ($connected ? 'rgba(80,200,120,0.6)' : 'var(--rule-2)')};
    color: ${({ $connected }) => ($connected ? '#70d898' : 'var(--ink)')};
    background: ${({ $working }) => ($working ? 'rgba(20,18,13,0.97)' : 'rgba(28,24,18,0.92)')};
  }

  @media (max-width: 767px) {
    bottom: 12px;
    right: 12px;
  }
`;

// ── Prompt example ────────────────────────────────────────────────────────────

const EXAMPLE_PROMPT = `Using the PrismaMRI tools, perform a systematic review of the medical volume currently open in the viewer and produce a structured report.

⚠️ Research and educational use only — not a substitute for clinical judgment.

## Core principle: MIP-first, three-plane confirmation before every annotation
**Always use Slab MIP as the default capture mode.** A 3–5 mm slab composites adjacent slices, dramatically improving lesion conspicuity, filling partial-volume gaps, and revealing fine structures (vessels, hairline fractures, subtle cortical breaks) that single slices routinely miss. Drop to a thinner slab or single slice only when you have a specific reason.

**Slab thickness decision ladder:**
- **5 mm MIP** → default for all survey captures and overview grids (maximum sensitivity, fewest missed findings)
- **3 mm MIP** → targeted detail on a known region of interest; use when 5 mm obscures fine margins
- **Single slice (slab_mm=0)** → only for: (a) precise boundary delineation before measuring, or (b) structures < 2 mm where slab averaging degrades them

Set the slab once with \`set_slab_mm\` before each capture group; it persists until you change it.

---

## Step 1 · Volume and spatial context
1. Call \`get_viewer_state\`. If \`volumeLoaded\` is false, stop and ask the user to open a file first.
   Record: modality (CT / MRI / CBCT), dims [W×H×D], voxel spacing in mm. Every size estimate depends on spacing.
2. Call \`set_render_preset "bone"\`, then \`capture_3d\` — this gives the full 3-D spatial skeleton before any 2-D navigation. Use it to understand the global anatomy, identify dominant structures, and orient your slice survey.

## Step 2 · Volume overview and windowing
Call \`get_volume_overview\` — this returns metadata and centre-slice captures of all three planes in one call. These centre slices are your anatomical reference point; no additional navigation needed at this stage.

**Default W/L is usually correct — do not change it unless you have a clear reason.**
The viewer auto-calibrates W/L on load. Only override if images are visibly clipped, washed-out, or flat:
- CT bone / dental / skeletal → \`apply_wl_preset "bone"\`
- CT soft tissue / abdomen → \`apply_wl_preset "soft_tissue"\`
- CT lung → \`apply_wl_preset "lung"\`
- MRI T1 → \`apply_wl_preset "t1"\` · MRI T2/FLAIR → \`apply_wl_preset "t2"\`

**Never call \`set_window_level\` with arbitrary values** — always use named presets or the file default.

## Step 3 · Systematic MIP survey — all three planes
Work plane by plane: **coronal → sagittal → axial**.

For each plane:
1. \`set_slab_mm 5\`
2. \`capture_overview_grid\` count=4 — full-extent screening pass with 5 mm MIP thumbnails.
3. List every region with a potential finding before moving on.
4. For each flagged region: \`navigate_to_slice\` → \`capture_slice\` (slab 5 mm) for detail.
5. If 5 mm obscures fine margins: \`set_slab_mm 3\`, recapture, restore to 5 mm.

After all three planes: cross-check your findings list — does every suspected lesion appear on more than one plane? A structure visible only on one plane is likely an artefact or an oblique cross-section of a normal structure.

## Step 4 · Three-plane confirmation (mandatory before any annotation)

**This step cannot be skipped.** Before calling \`add_annotation\` for any finding:

1. \`navigate_to_slice\` to the finding centre, then **\`capture_all_planes\`** — view the finding simultaneously on coronal, sagittal and axial.
2. Ask yourself:
   - Is the finding visible on **at least 2 of the 3 planes**? If no → do not annotate; it is likely an artefact or partial-volume effect.
   - On each plane where it appears, does the shape and density make sense for the proposed diagnosis?
   - Could this be an **oblique cross-section of a normal structure** — a tilted tooth, vessel, nerve canal, duct, or tendon? A tilted tubular structure always appears round or oval on the perpendicular plane.
3. \`step_slice\` ±1, ±2 with \`capture_slice\` (slab_mm=3) to confirm the finding spans ≥3 contiguous slices.
4. Only after confirming on multiple planes and multiple slices → proceed to annotate.

### Annotating confirmed findings — \`add_annotation\` fields
- **Plane** — use the plane where the finding is most clearly centred and measurable.
- \`fx\` / \`fy\` — geometric centre of the finding (0–1 fraction of image width/height).
- \`severity\`: \`critical\` immediate risk · \`serious\` timely attention · \`moderate\` monitor · \`comment\` incidental
- \`label\` — concise anatomical name, ≤ 5 words
- \`summary\` — 3–5 sentences: (1) morphology + margins, (2) size if measurable, (3) precise location, (4) top 2–3 differentials with one-line reasoning each, (5) clinical relevance. **Do not include "confidence: X%" in summary text.**
- \`confidence\` — integer 0–100 as a **separate field**, never embedded in summary. Never exceed 92 for pathological findings.
- \`size_mm\` — largest in-plane diameter in mm (omit for diffuse or ill-defined findings)

### Differential ranking rule
Rank by: morphology → margins → density/signal → location → associated structures → patient age (if known).
State reasoning explicitly: *"Most likely X because [one feature]; Y is possible if [condition]."*

### Common misidentification traps
- **Round structure on one plane** — may be an oblique cut through a tube (vessel, duct, nerve, root canal, impacted tooth). Always verify on orthogonal planes.
- **Hyperdense rim around a dark centre** — may be cortical bone + cancellous interior, not a cystic wall.
- **Partial-volume at a bone edge** — appears as a soft-tissue density "lesion" adjacent to dense cortex. Check ≥3 slices and orthogonal planes.
- **MIP projection artefact** — a vessel running parallel to the slab can mimic a nodule. Switch to slab_mm=0 on that slice to resolve.

## Step 5 · 3-D spatial verification
After all annotations are placed:
1. \`set_render_preset "bone"\` (skeletal/dental CT) or \`"mip"\` (angiography/airway).
2. \`capture_3d\` — confirm every marker lands at the correct anatomical site.
3. If a marker looks misplaced: remove it, re-examine with \`capture_all_planes\` + slab_mm 3, re-annotate.

## Step 6 · Structured report
Present the final report in this exact structure:

**Technique** — modality, dims, voxel spacing mm, W/L preset applied, slab thickness used.

**Findings** — one paragraph per anatomical region, most-severe first. Each abnormal finding must include: anatomical location (name + approximate voxel coords), size if measurable, morphology, top differential.

**Impression** — 3–5 sentences. Lead with the most clinically significant conclusion. Include confidence levels for critical/serious findings.

**Differentials** — for each serious/critical finding: numbered list with likelihood reasoning.

**Recommendations** — specific next steps: additional sequences or planes, clinical correlation, specialist referral type, urgency (routine / urgent / emergent).`;

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
  scrollbar-width: thin;
  scrollbar-color: var(--rule-2) transparent;
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: var(--rule-2); border-radius: 2px; }
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

// ── Shared prompt section ─────────────────────────────────────────────────────

function PromptSection() {
  const [promptOpen, setPromptOpen] = useState(true);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');

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

// ── SessionPanel ──────────────────────────────────────────────────────────────
//
// Not connected  →  same for Web and PWA: download button + instructions.
// Connected      →  differs by mode:
//   Web (relay)  →  prompt example + disconnect
//   PWA (local)  →  direct connection info + prompt example

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
        {/* ── Header — identical for all states ── */}
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

        {/* ── Body ── */}
        <PanelBody>
          {/* ── NOT CONNECTED: same for Web and PWA ── */}
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
                → Settings → <strong style={{ color: 'var(--ink-2)' }}>Extensions</strong> → Install
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

          {/* ── CONNECTED via local WS (PWA) ── */}
          {mcpConnected && local && (
            <>
              <Row>
                <Label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Zap size={10} />
                  Direct connection
                  <InfoTip text="Claude connects directly to this app with no relay — no data leaves your machine. Lower latency, works offline." />
                </Label>
                <Value style={{ fontSize: 10.5, opacity: 0.45 }}>
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
