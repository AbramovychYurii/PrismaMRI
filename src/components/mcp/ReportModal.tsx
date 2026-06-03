/**
 * ReportModal — PDF export dialog for AI findings.
 *
 * Left panel: scope (this finding / all findings) + format toggles + download.
 * Right panel: live document preview.
 *
 * PDF generation is not yet implemented — the Download button is a placeholder.
 */

import { AuroraSparkles } from '@/components/ui/AuroraSparkles';
import { SEVERITY_HEX, SEVERITY_LABEL } from '@/constants';
import { generateReport } from '@/lib/reportPdf';
import { useVolumeStore } from '@/store/volumeStore';
import type { AiAnnotation } from '@/types';
import { Download, FileText, Loader, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes } from 'styled-components';

// ── Animations ───────────────────────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const slideUp = keyframes`
  from { transform: translateY(12px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
`;

// ── Shell ────────────────────────────────────────────────────────────────────

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  background: var(--surface-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  animation: ${fadeIn} 150ms ease;
  padding: 20px;

  @media (max-width: 640px) {
    padding: 0;
    align-items: stretch;
  }
`;

const Shell = styled.div`
  display: flex;
  width: min(900px, 100%);
  height: min(620px, 90vh);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--rule-2);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.9);
  animation: ${slideUp} 180ms cubic-bezier(0.22, 1, 0.36, 1);
  font-family: var(--mono);

  @media (max-width: 640px) {
    flex-direction: column;
    width: 100%;
    height: 100%;
    border-radius: 0;
    border: none;
    position: relative;
  }
`;

// ── Left panel ───────────────────────────────────────────────────────────────

const LeftPanel = styled.div`
  width: 300px;
  flex-shrink: 0;
  background: rgba(18, 16, 12, 0.98);
  border-right: 1px solid var(--rule-2);
  display: flex;
  flex-direction: column;
  padding: 24px 20px 20px;
  gap: 20px;

  @media (max-width: 640px) {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--rule-2);
    flex-shrink: 0;
    overflow-y: auto;
    /* leave room for the floating close button */
    padding: 16px 16px 16px;
    padding-top: 52px;
    gap: 14px;
    max-height: none;
    flex: 0 0 auto;
  }
`;

const PanelLabel = styled.span`
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-3);
`;

const PanelTitle = styled.h2`
  margin: 4px 0 2px;
  font-family: var(--serif);
  font-size: 22px;
  font-weight: 400;
  color: var(--ink);
`;

const PanelSub = styled.p`
  margin: 0;
  font-size: 11.5px;
  color: var(--ink-3);
  line-height: 1.4;
`;

// Scope

const SectionLabel = styled.span`
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-2);
  display: block;
  margin-bottom: 7px;
`;

const ScopeSection = styled.div``;

const ScopeOption = styled.label<{ $active: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--amber)' : 'var(--rule-2)')};
  background: ${({ $active }) => ($active ? 'rgba(196,153,70,0.08)' : 'transparent')};
  cursor: pointer;
  margin-bottom: 6px;
  transition: border-color 120ms, background 120ms;
  &:last-child { margin-bottom: 0; }
`;

/** Hides the native radio and renders a custom dot — inactive matches background. */
const Radio = styled.input`
  appearance: none;
  -webkit-appearance: none;
  flex-shrink: 0;
  margin-top: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--rule-2);
  background: transparent;
  cursor: pointer;
  position: relative;
  transition: border-color 120ms, background 120ms;

  &:checked {
    border-color: var(--amber);
    background: var(--amber);
    box-shadow: inset 0 0 0 3px rgba(18, 16, 12, 0.98);
  }
`;

const ScopeBody = styled.div`
  flex: 1;
`;

const ScopeName = styled.div<{ $active: boolean }>`
  font-size: 12.5px;
  font-weight: 600;
  color: ${({ $active }) => ($active ? 'var(--ink)' : 'var(--ink-2)')};
  letter-spacing: 0.02em;
`;

const ScopeDesc = styled.div`
  font-size: 10.5px;
  color: var(--ink-3);
  margin-top: 3px;
  line-height: 1.4;
`;

// Format

const FormatSection = styled.div``;

const FormatRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const FormatToggle = styled.button<{ $active: boolean }>`
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--amber)' : 'var(--rule-2)')};
  background: ${({ $active }) => ($active ? 'rgba(196,153,70,0.10)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--amber)' : 'var(--ink-2)')};
  cursor: pointer;
  transition: border-color 100ms, background 100ms, color 100ms;
  &:hover {
    ${({ $active }) => !$active && 'border-color: var(--ink-4); color: var(--ink-2);'}
  }
`;

// Download

const DownloadArea = styled.div`
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const DownloadBtn = styled.button<{ $loading?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: none;
  background: var(--amber);
  color: #0e0c09;
  font-family: var(--mono);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: ${({ $loading }) => ($loading ? 'wait' : 'pointer')};
  opacity: ${({ $loading }) => ($loading ? 0.7 : 1)};
  transition: filter 120ms, opacity 120ms;
  &:hover:not(:disabled) { filter: brightness(1.08); }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

const SpinIcon = styled(Loader)`
  animation: ${spin} 700ms linear infinite;
`;

// ── Right panel ──────────────────────────────────────────────────────────────

const RightPanel = styled.div`
  flex: 1;
  background: rgba(12, 11, 8, 0.98);
  display: flex;
  flex-direction: column;
`;

const PreviewHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--rule);
`;

const PreviewLabel = styled.span`
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-3);
  display: flex;
  align-items: center;
  gap: 6px;
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: var(--ink-3);
  line-height: 0;
  &:hover { color: var(--ink); }

  @media (max-width: 640px) {
    display: none;
  }
`;

const MobileCloseBtn = styled.button`
  display: none;

  @media (max-width: 640px) {
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    top: 12px;
    right: 14px;
    z-index: 10;
    background: rgba(30, 27, 20, 0.9);
    border: 1px solid var(--rule-2);
    border-radius: 50%;
    width: 32px;
    height: 32px;
    cursor: pointer;
    color: var(--ink-3);
    line-height: 0;
    &:hover { color: var(--ink); }
  }
`;

const PreviewScroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  /* block so Doc stretches to fit all content vertically */
  display: block;
`;

// Document

const Doc = styled.div`
  background: #fafaf8;
  color: #1a1814;
  width: 100%;
  max-width: 520px;
  margin: 0 auto;          /* centre without flex tricks */
  border-radius: 4px;
  padding: 28px 32px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  /* ensure bg covers all content including images */
  overflow: hidden;
  box-sizing: border-box;
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
  line-height: 1.5;
`;

const DocHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid #1a1814;
`;

const DocLogo = styled.div`
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-family: inherit;
  em { font-style: italic; font-weight: 400; }
`;

const DocReportLabel = styled.div`
  text-align: right;
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  line-height: 1.6;
  color: #555;
`;

const DocMeta = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px 16px;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid #ddd;
`;

const DocMetaItem = styled.div``;

const DocMetaKey = styled.div`
  font-size: 8px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #888;
  margin-bottom: 2px;
`;

const DocMetaVal = styled.div`
  font-size: 10px;
  color: #1a1814;
  word-break: break-all;
`;

const DocSectionLabel = styled.div`
  font-size: 8px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #888;
  margin-bottom: 10px;
`;

const FindingCard = styled.div<{ $color: string }>`
  border-left: 3px solid ${({ $color }) => $color};
  padding: 10px 12px;
  background: #f4f3ef;
  border-radius: 0 4px 4px 0;
  margin-bottom: 10px;
`;

const FindingRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
`;

const FindingIndex = styled.span`
  font-size: 11px;
  color: #888;
  margin-right: 6px;
`;

const FindingTitle = styled.span`
  font-size: 12px;
  font-weight: 700;
  color: #1a1814;
  flex: 1;
`;

const FindingSeverity = styled.span<{ $color: string }>`
  font-size: 8.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ $color }) => $color};
  border: 1px solid ${({ $color }) => $color}66;
  padding: 2px 6px;
  border-radius: 999px;
`;

const FindingLocation = styled.div`
  font-size: 9px;
  color: #888;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 6px;
`;

const FindingText = styled.div`
  font-size: 10.5px;
  color: #333;
  line-height: 1.55;
`;

const CERTAINTY_COLOR_PREVIEW = '#60a5fa';

const FindingCertaintyRow = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 7px;
`;

const FindingCertaintyLabel = styled.span`
  font-size: 8px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #999;
`;

const FindingCertaintyValue = styled.span`
  font-size: 9px;
  font-weight: 700;
  color: ${CERTAINTY_COLOR_PREVIEW};
  flex-shrink: 0;
`;

/** Placeholder shown when images are being captured for preview. */
const FindingThumb = styled.img`
  display: block;
  width: 100%;
  border-radius: 3px;
  margin-top: 8px;
  border: 1px solid #ddd;
`;

const FindingThumbPlaceholder = styled.div`
  width: 100%;
  height: 64px;
  margin-top: 8px;
  background: repeating-linear-gradient(
    -45deg,
    #f0efe9,
    #f0efe9 4px,
    #e8e7e1 4px,
    #e8e7e1 8px
  );
  border-radius: 3px;
  border: 1px solid #ddd;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #aaa;
`;

/** Visual page break separator inside the preview doc. */
const PageBreakLine = styled.div`
  margin: 20px -32px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: #bbb;
  font-size: 8px;
  letter-spacing: 0.14em;
  text-transform: uppercase;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #ddd;
    border-style: dashed;
    border-width: 0 0 1px;
  }
`;

const DocNote = styled.div`
  margin-top: 16px;
  padding: 10px 12px;
  background: #f0efe9;
  border-radius: 4px;
  border: 1px solid #ddd;
`;

const DocNoteLabel = styled.div`
  font-size: 8px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #888;
  margin-bottom: 4px;
`;

const DocNoteText = styled.div`
  font-size: 10px;
  color: #555;
  line-height: 1.5;
`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function planeName(plane: string) {
  return plane.charAt(0).toUpperCase() + plane.slice(1);
}

function sliceNum(a: AiAnnotation) {
  if (a.plane === 'coronal') return a.voxel.y + 1;
  if (a.plane === 'sagittal') return a.voxel.x + 1;
  return a.voxel.z + 1;
}

// ── Component ────────────────────────────────────────────────────────────────

type Scope = 'finding' | 'all';
type Format = 'images' | 'markers';

interface Props {
  finding: AiAnnotation;
  findingIndex: number;
  allFindings: AiAnnotation[];
  onClose: () => void;
}

/**
 * Draw the same circular pin the app uses on 2-D panels — ring only, no crosshair.
 * Returns JPEG data URL + aspect ratio (height/width) of the source canvas.
 */
function annotateCanvas(
  src: HTMLCanvasElement,
  fx: number,
  fy: number,
  hexColor: string,
): { data: string; ar: number } {
  const off = document.createElement('canvas');
  off.width = src.width;
  off.height = src.height;
  const ctx = off.getContext('2d')!;
  ctx.drawImage(src, 0, 0);

  const px = fx * src.width;
  const py = fy * src.height;
  // Match the 24 px CSS ring scaled to canvas resolution
  const r = Math.max(src.width, src.height) * 0.038;
  const lw = Math.max(src.width, src.height) * 0.004;

  // Dark outer halo — mirrors box-shadow: 0 0 0 1px rgba(0,0,0,0.55)
  ctx.beginPath();
  ctx.arc(px, py, r + lw, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = lw; // fix 6: 2× thinner halo
  ctx.stroke();

  // Coloured glow (animated in the app; static here)
  ctx.shadowColor = `${hexColor}bb`;
  ctx.shadowBlur = r * 0.5;

  // Main ring — fix 6: 2× thinner border
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.strokeStyle = hexColor;
  ctx.lineWidth = lw * 0.9;
  ctx.stroke();

  ctx.shadowBlur = 0;

  return { data: off.toDataURL('image/jpeg', 0.88), ar: src.height / src.width };
}

/** Capture a canvas as-is (no annotation). Returns data + aspect ratio. */
function captureRaw(src: HTMLCanvasElement): { data: string; ar: number } {
  return { data: src.toDataURL('image/jpeg', 0.88), ar: src.height / src.width };
}

function waitForPaint(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

export function ReportModal({ finding, findingIndex, allFindings, onClose }: Props) {
  const [scope, setScope] = useState<Scope>('finding');
  const [formats, setFormats] = useState<Set<Format>>(new Set<Format>(['images', 'markers']));
  const [downloading, setDownloading] = useState(false);
  const [previewThumbs, setPreviewThumbs] = useState<Map<string, { data: string; ar: number }>>(
    new Map(),
  );

  const volume = useVolumeStore((s) => s.volume);
  const canvasRefs = useVolumeStore((s) => s.canvasRefs);
  const setCursor = useVolumeStore((s) => s.setCursor);
  const cursor = useVolumeStore((s) => s.cursor);

  const today = new Date().toISOString().slice(0, 10);
  const modality = volume?.meta.modality ?? 'CT';
  const dims = volume?.meta.dims;
  const spacing = volume?.meta.spacing;

  const scopeFindings = scope === 'finding' ? [finding] : allFindings;

  const showImages = formats.has('images');
  const showMarkers = formats.has('markers');

  const toggleFormat = (f: Format) =>
    setFormats((prev) => {
      const next = new Set(prev);
      next.has(f) ? next.delete(f) : next.add(f);
      return next;
    });

  // ── Capture preview thumbnails — synchronous, NO cursor changes ──────────
  // Captures whatever slice each plane canvas currently shows.
  // This prevents any background viewer repaint when options/scope change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: canvasRefs does not change identity; scope/showImages/showMarkers are the real triggers
  useEffect(() => {
    if (!showImages) {
      setPreviewThumbs(new Map());
      return;
    }
    const thumbs = new Map<string, { data: string; ar: number }>();
    for (const f of scopeFindings) {
      const canvas = canvasRefs[f.plane as keyof typeof canvasRefs];
      if (canvas) {
        thumbs.set(
          f.id,
          showMarkers
            ? annotateCanvas(canvas, f.fx, f.fy, SEVERITY_HEX[f.severity])
            : captureRaw(canvas),
        );
      }
    }
    setPreviewThumbs(thumbs);
  }, [showImages, showMarkers, scope]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // For PDF: navigate to each finding's exact slice to get accurate captures
      const thumbnails = new Map<string, { data: string; ar: number }>();

      if (showImages && cursor) {
        const savedCursor = { ...cursor };
        for (const f of scopeFindings) {
          setCursor(f.voxel);
          await waitForPaint();
          const canvas = canvasRefs[f.plane as keyof typeof canvasRefs];
          if (canvas) {
            thumbnails.set(
              f.id,
              showMarkers
                ? annotateCanvas(canvas, f.fx, f.fy, SEVERITY_HEX[f.severity])
                : captureRaw(canvas),
            );
          }
        }
        setCursor(savedCursor);
        await waitForPaint();
      }

      const blob = generateReport({
        findings: scopeFindings,
        allFindings,
        scope,
        volumeMeta: volume?.meta ?? null,
        scalarMin: volume?.scalarMin,
        scalarMax: volume?.scalarMax,
        bitsAllocated: volume?.meta.bitsAllocated,
        formatId: volume?.formatId,
        thumbnails,
        today,
      });

      const volSlug = (volume?.meta.protocol ?? volume?.formatId ?? 'scan')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-{2,}/g, '-')
        .slice(0, 30)
        .toLowerCase();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prismamri-${today}-${volSlug}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return createPortal(
    <Backdrop
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Shell>
        <MobileCloseBtn type="button" aria-label="Close" onClick={onClose}>
          <X size={16} />
        </MobileCloseBtn>
        {/* ── Left: export controls ──────────────────────────────────────── */}
        <LeftPanel>
          <div>
            <PanelLabel>Export</PanelLabel>
            <PanelTitle>Generate report</PanelTitle>
            <PanelSub>Choose what to include in the PDF.</PanelSub>
          </div>

          {/* Scope */}
          <ScopeSection>
            <SectionLabel>Scope</SectionLabel>

            <ScopeOption $active={scope === 'finding'}>
              <Radio
                type="radio"
                name="report-scope"
                checked={scope === 'finding'}
                onChange={() => setScope('finding')}
              />
              <ScopeBody>
                <ScopeName $active={scope === 'finding'}>This finding</ScopeName>
                <ScopeDesc>
                  {finding.label.slice(0, 32)}
                  {finding.label.length > 32 ? '…' : ''} · F-
                  {String(findingIndex + 1).padStart(2, '0')}
                </ScopeDesc>
              </ScopeBody>
              {/* pages label removed */}
            </ScopeOption>

            <ScopeOption $active={scope === 'all'}>
              <Radio
                type="radio"
                name="report-scope"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
              />
              <ScopeBody>
                <ScopeName $active={scope === 'all'}>All findings</ScopeName>
                <ScopeDesc>{allFindings.length} findings + consolidated impression</ScopeDesc>
              </ScopeBody>
              {/* pages label removed */}
            </ScopeOption>
          </ScopeSection>

          {/* Include options */}
          <FormatSection>
            <SectionLabel>Include in report</SectionLabel>
            <FormatRow>
              <FormatToggle
                $active={formats.has('images')}
                type="button"
                onClick={() => toggleFormat('images')}
              >
                Scan images
              </FormatToggle>
              <FormatToggle
                $active={formats.has('markers')}
                type="button"
                disabled={!formats.has('images')}
                style={{ opacity: formats.has('images') ? 1 : 0.4 }}
                onClick={() => formats.has('images') && toggleFormat('markers')}
              >
                Finding markers
              </FormatToggle>
            </FormatRow>
          </FormatSection>

          {/* Download */}
          <DownloadArea>
            <DownloadBtn
              type="button"
              $loading={downloading}
              disabled={downloading}
              onClick={handleDownload}
            >
              {downloading ? <SpinIcon size={14} /> : <Download size={14} />}
              {downloading ? 'Generating…' : 'Download PDF'}
            </DownloadBtn>
          </DownloadArea>
        </LeftPanel>

        {/* ── Right: preview ─────────────────────────────────────────────── */}
        <RightPanel>
          <PreviewHeader>
            <PreviewLabel>
              <FileText size={12} />
              Preview
            </PreviewLabel>
            <CloseBtn type="button" aria-label="Close" onClick={onClose}>
              <X size={16} />
            </CloseBtn>
          </PreviewHeader>

          <PreviewScroll>
            <Doc>
              {/* Header */}
              <DocHeader>
                <DocLogo>
                  Prisma<em>MRI</em>
                </DocLogo>
                <DocReportLabel>
                  FINDINGS REPORT
                  <br />
                  {scope === 'finding' ? 'Single finding' : `${allFindings.length} findings`}
                  <br />
                  {today}
                </DocReportLabel>
              </DocHeader>

              {/* Volume metadata */}
              {volume && (
                <DocMeta>
                  {volume.meta.protocol && (
                    <DocMetaItem>
                      <DocMetaKey>Protocol</DocMetaKey>
                      <DocMetaVal>{volume.meta.protocol}</DocMetaVal>
                    </DocMetaItem>
                  )}
                  <DocMetaItem>
                    <DocMetaKey>Modality</DocMetaKey>
                    <DocMetaVal>
                      {modality} · {volume.meta.bitsAllocated}-bit · HU
                    </DocMetaVal>
                  </DocMetaItem>
                  <DocMetaItem>
                    <DocMetaKey>HU range</DocMetaKey>
                    <DocMetaVal>
                      {Math.round(volume.scalarMin)} → {Math.round(volume.scalarMax)} HU
                    </DocMetaVal>
                  </DocMetaItem>
                  {dims && (
                    <DocMetaItem>
                      <DocMetaKey>Volume</DocMetaKey>
                      <DocMetaVal>
                        {dims[0]} × {dims[1]} × {dims[2]} vox
                      </DocMetaVal>
                    </DocMetaItem>
                  )}
                  {spacing && (
                    <DocMetaItem>
                      <DocMetaKey>Spacing</DocMetaKey>
                      <DocMetaVal>
                        {spacing[0]} × {spacing[1]} × {spacing[2]} mm
                      </DocMetaVal>
                    </DocMetaItem>
                  )}
                  <DocMetaItem>
                    <DocMetaKey>Source</DocMetaKey>
                    <DocMetaVal>Local · in-memory</DocMetaVal>
                  </DocMetaItem>
                </DocMeta>
              )}

              {/* Findings */}
              <DocSectionLabel>
                {scope === 'finding' ? 'Selected finding' : `All findings · ${allFindings.length}`}
              </DocSectionLabel>

              {(() => {
                const perPage = showImages ? 2 : 4;
                return scopeFindings.map((f, i) => {
                  const globalIdx = allFindings.findIndex((x) => x.id === f.id);
                  const color = SEVERITY_HEX[f.severity];
                  const thumb = previewThumbs.get(f.id);
                  const pageBreak = i > 0 && i % perPage === 0;
                  return (
                    <div key={f.id}>
                      {pageBreak && (
                        <PageBreakLine>page {Math.floor(i / perPage) + 1}</PageBreakLine>
                      )}
                      <FindingCard $color={color}>
                        <FindingRow>
                          <FindingIndex>{String(globalIdx + 1).padStart(2, '0')}</FindingIndex>
                          <FindingTitle>{f.label}</FindingTitle>
                          <FindingSeverity $color={color}>
                            {SEVERITY_LABEL[f.severity]}
                          </FindingSeverity>
                        </FindingRow>
                        <FindingLocation>
                          {planeName(f.plane).toUpperCase()} · SLICE {sliceNum(f)}
                          &nbsp; x{f.voxel.x} · y{f.voxel.y} · z{f.voxel.z}
                          {f.sizeMm != null && <> · ø{f.sizeMm} mm</>}
                        </FindingLocation>
                        {f.summary && <FindingText>{f.summary}</FindingText>}
                        {f.confidence != null && (
                          <FindingCertaintyRow>
                            <AuroraSparkles size={10} strokeWidth={1.5} />
                            <FindingCertaintyLabel>Certainty:</FindingCertaintyLabel>
                            <FindingCertaintyValue>{f.confidence}%</FindingCertaintyValue>
                          </FindingCertaintyRow>
                        )}
                        {showImages &&
                          (thumb ? (
                            <FindingThumb src={thumb.data} alt={`Scan — ${f.label}`} />
                          ) : (
                            <FindingThumbPlaceholder>scan image</FindingThumbPlaceholder>
                          ))}
                      </FindingCard>
                    </div>
                  );
                });
              })()}

              {/* Note */}
              <DocNote>
                <DocNoteLabel>Note</DocNoteLabel>
                <DocNoteText>
                  {scope === 'finding'
                    ? `Isolated export of finding F-${String(findingIndex + 1).padStart(2, '0')}. Full study contains ${allFindings.length} finding${allFindings.length !== 1 ? 's' : ''} — switch scope to include all findings and the consolidated impression.`
                    : 'This is an AI-assisted descriptive read of imaging only. Not a diagnosis. Clinical correlation and review by a qualified radiologist is required before any clinical decision.'}
                </DocNoteText>
              </DocNote>
            </Doc>
          </PreviewScroll>
        </RightPanel>
      </Shell>
    </Backdrop>,
    document.body,
  );
}
