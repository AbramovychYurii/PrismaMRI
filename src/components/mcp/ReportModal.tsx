/**
 * ReportModal — PDF export dialog for AI findings.
 *
 * Left panel: scope (this finding / all findings) + format toggles + download.
 * Right panel: live document preview.
 *
 * All visual styling lives in `ReportModal.styles.ts`. This file owns the
 * capture/encode logic, the PDF generation glue, and the preview JSX.
 */

import { AuroraSparkles } from '@/components/ui/AuroraSparkles';
import { SEVERITY_HEX, SEVERITY_LABEL } from '@/constants';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { waitForPaint } from '@/lib/mcp/canvas-utils';
import { generateReport } from '@/lib/reportPdf';
import { useVolumeStore } from '@/store/volumeStore';
import type { AiAnnotation } from '@/types';
import { Download, FileText, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Backdrop,
  Doc,
  DocHeader,
  DocLogo,
  DocMeta,
  DocMetaItem,
  DocMetaKey,
  DocMetaVal,
  DocNote,
  DocNoteLabel,
  DocNoteText,
  DocReportLabel,
  DocSectionLabel,
  DownloadArea,
  DownloadBtn,
  FindingCard,
  FindingConfidenceLabel,
  FindingConfidenceRow,
  FindingConfidenceValue,
  FindingIndex,
  FindingLocation,
  FindingRow,
  FindingSeverity,
  FindingText,
  FindingThumb,
  FindingThumbPlaceholder,
  FindingTitle,
  FormatRow,
  FormatSection,
  FormatToggle,
  LeftPanel,
  MobileCloseBtn,
  PageBreakLine,
  PanelLabel,
  PanelSub,
  PanelTitle,
  CloseBtn as PreviewCloseBtn,
  PreviewHeader,
  PreviewLabel,
  PreviewScroll,
  Radio,
  RightPanel,
  ScopeBody,
  ScopeDesc,
  ScopeName,
  ScopeOption,
  ScopeSection,
  SectionLabel,
  Shell,
  SpinIcon,
} from './ReportModal.styles';

// ── Helpers ──────────────────────────────────────────────────────────────────

function planeName(plane: string) {
  return plane.charAt(0).toUpperCase() + plane.slice(1);
}

function sliceNum(a: AiAnnotation) {
  if (a.plane === 'coronal') return a.voxel.y + 1;
  if (a.plane === 'sagittal') return a.voxel.x + 1;
  return a.voxel.z + 1;
}

// ── Capture ──────────────────────────────────────────────────────────────────

type Capture = { data: string; ar: number };

/** JPEG quality for embedded scan thumbnails — preserves fine anatomy without exploding PDF size. */
const PREVIEW_JPEG_QUALITY = 0.88;

/**
 * Draw the same circular pin the app uses on 2-D panels — ring only, no crosshair.
 * Returns JPEG data URL + aspect ratio (height/width) of the source canvas.
 */
function annotateCanvas(src: HTMLCanvasElement, fx: number, fy: number, hexColor: string): Capture {
  const off = document.createElement('canvas');
  off.width = src.width;
  off.height = src.height;
  const ctx = off.getContext('2d');
  if (!ctx) throw new Error('annotateCanvas: failed to acquire 2D context');
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
  ctx.lineWidth = lw;
  ctx.stroke();

  // Coloured glow (animated in the app; static here)
  ctx.shadowColor = `${hexColor}bb`;
  ctx.shadowBlur = r * 0.5;

  // Main ring
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.strokeStyle = hexColor;
  ctx.lineWidth = lw * 0.9;
  ctx.stroke();

  ctx.shadowBlur = 0;

  return { data: off.toDataURL('image/jpeg', PREVIEW_JPEG_QUALITY), ar: src.height / src.width };
}

/** Capture a canvas as-is (no annotation). Returns data + aspect ratio. */
function captureRaw(src: HTMLCanvasElement): Capture {
  return {
    data: src.toDataURL('image/jpeg', PREVIEW_JPEG_QUALITY),
    ar: src.height / src.width,
  };
}

// ── Stable inline-style references ──────────────────────────────────────────

/** Avoid allocating a fresh `style` object on every render of the disabled toggle. */
const FORMAT_TOGGLE_DISABLED_STYLE: React.CSSProperties = { opacity: 0.4 };
const FORMAT_TOGGLE_ENABLED_STYLE: React.CSSProperties = { opacity: 1 };

// ── Component ────────────────────────────────────────────────────────────────

type Scope = 'finding' | 'all';
type Format = 'images' | 'markers';

interface Props {
  finding: AiAnnotation;
  findingIndex: number;
  allFindings: AiAnnotation[];
  onClose: () => void;
}

export function ReportModal({ finding, findingIndex, allFindings, onClose }: Props) {
  const [scope, setScope] = useState<Scope>('finding');
  const [formats, setFormats] = useState<Set<Format>>(() => new Set<Format>(['images', 'markers']));
  const [downloading, setDownloading] = useState(false);
  const [previewThumbs, setPreviewThumbs] = useState<Map<string, Capture>>(() => new Map());

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
      if (next.has(f)) next.delete(f);
      else next.add(f);
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
    const thumbs = new Map<string, Capture>();
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
      const thumbnails = new Map<string, Capture>();

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

  // Trap Tab/Shift+Tab navigation inside the dialog so keyboard users can't
  // tab into the page underneath while the modal is open.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef);

  // Esc closes the modal — mirrors ConfirmModal / KeyboardShortcutsModal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <Backdrop
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Shell ref={dialogRef}>
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
                  {finding.label.length > 32 ? '…' : ''}
                </ScopeDesc>
              </ScopeBody>
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
                style={
                  formats.has('images') ? FORMAT_TOGGLE_ENABLED_STYLE : FORMAT_TOGGLE_DISABLED_STYLE
                }
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
            <PreviewCloseBtn type="button" aria-label="Close" onClick={onClose}>
              <X size={16} />
            </PreviewCloseBtn>
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
                          <FindingConfidenceRow>
                            <AuroraSparkles size={10} strokeWidth={1.5} />
                            <FindingConfidenceLabel>Confidence:</FindingConfidenceLabel>
                            <FindingConfidenceValue>{f.confidence}%</FindingConfidenceValue>
                          </FindingConfidenceRow>
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
