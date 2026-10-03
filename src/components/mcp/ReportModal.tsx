/**
 * ReportModal — PDF export dialog for AI findings.
 *
 * Left panel: scope (this finding / all findings) + format toggles + download.
 * Right panel: live document preview.
 *
 * All visual styling lives in `ReportModal.styles.ts`; canvas capture and
 * marker drawing in `lib/report/capture.ts`. This file owns the PDF generation
 * glue and the preview JSX.
 */

import { AuroraSparkles } from '@/components/ui/AuroraSparkles';
import { PLANE_LABEL, SEVERITY_HEX, SEVERITY_LABEL } from '@/constants';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { downloadBlob } from '@/lib/download';
import { waitForPaint } from '@/lib/mcp/canvas-utils';
import { type Capture, annotateCanvas, captureRaw } from '@/lib/report/capture';
import { sliceNumber } from '@/lib/volume/plane';
import { intensityUnit } from '@/lib/volume/units';
import { useVolumeStore } from '@/store/volumeStore';
import type { AiAnnotation, SlicePlane } from '@/types';
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

const planeName = (plane: SlicePlane) => PLANE_LABEL[plane].primary;

const sliceNum = (a: AiAnnotation) => sliceNumber(a.voxel, a.plane);

/** Avoid allocating a fresh `style` object on every render of the disabled toggle. */
const FORMAT_TOGGLE_DISABLED_STYLE: React.CSSProperties = { opacity: 0.4 };
const FORMAT_TOGGLE_ENABLED_STYLE: React.CSSProperties = { opacity: 1 };

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
  // The report says what the volume says: no modality, no invented CT or HU.
  const modality = volume?.meta.modality ?? '—';
  const unit = intensityUnit(volume?.meta.modality);
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

      // jsPDF (and the html2canvas / DOMPurify it pulls in) loads on demand.
      const { generateReport } = await import('@/lib/reportPdf');
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

      downloadBlob(blob, `prismamri-${today}-${volSlug}.pdf`);
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
                      {[`${modality} · ${volume.meta.bitsAllocated}-bit`, unit]
                        .filter(Boolean)
                        .join(' · ')}
                    </DocMetaVal>
                  </DocMetaItem>
                  <DocMetaItem>
                    <DocMetaKey>{unit ? `${unit} range` : 'Range'}</DocMetaKey>
                    <DocMetaVal>
                      {[`${Math.round(volume.scalarMin)} → ${Math.round(volume.scalarMax)}`, unit]
                        .filter(Boolean)
                        .join(' ')}
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
