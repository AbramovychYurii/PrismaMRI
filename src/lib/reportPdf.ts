/**
 * reportPdf — jsPDF-based findings report generator.
 *
 * Pure function: receives all data up-front (including pre-captured
 * thumbnail data URLs) and returns a PDF Blob.  No React hooks inside.
 */

import type { AiAnnotation, AnnotationSeverity, ParsedVolumeMeta } from '@/types';
import jsPDF from 'jspdf';

// ── Severity mappings for PDF ────────────────────────────────────────────────

const PDF_LABEL: Record<AnnotationSeverity, string> = {
  critical: 'CRITICAL',
  serious: 'SERIOUS',
  moderate: 'MODERATE',
  comment: 'COMMENT',
};

// Exact values from SEVERITY_HEX in constants.ts
const SEVERITY_RGB: Record<AnnotationSeverity, [number, number, number]> = {
  critical: [255, 59, 48], // #ff3b30
  serious: [255, 149, 0], // #ff9500
  moderate: [255, 214, 10], // #ffd60a
  comment: [52, 199, 89], // #34c759
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
void hexToRgb; // used optionally; keep to avoid lint errors

function planeName(plane: string): string {
  return plane.charAt(0).toUpperCase() + plane.slice(1);
}

function sliceNum(a: AiAnnotation): number {
  if (a.plane === 'coronal') return a.voxel.y + 1;
  if (a.plane === 'sagittal') return a.voxel.x + 1;
  return a.voxel.z + 1;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReportParams {
  findings: AiAnnotation[];
  /** Original ordered list (used for finding index labels). */
  allFindings: AiAnnotation[];
  scope: 'finding' | 'all';
  volumeMeta: ParsedVolumeMeta | null;
  scalarMin?: number;
  scalarMax?: number;
  bitsAllocated?: number;
  formatId?: string;
  /** finding.id → { JPEG data URL, aspect ratio height/width }. */
  thumbnails: Map<string, { data: string; ar: number }>;
  today: string;
}

// ── Page layout constants (mm) ───────────────────────────────────────────────

const PW = 210; // page width
const PH = 297; // page height
const ML = 18; // left margin
const MR = 18; // right margin
const MT = 10; // top margin (halved)
const MB = 10; // bottom margin (halved)
const CW = PW - ML - MR; // content width = 174
const XR = ML + CW; // right edge = 192

const COL3 = CW / 3; // ~58 mm per meta column

// ── Colours ──────────────────────────────────────────────────────────────────

const INK: [number, number, number] = [26, 24, 20];
const INK2: [number, number, number] = [80, 75, 65];
const INK3: [number, number, number] = [130, 120, 105];
const RULE: [number, number, number] = [220, 215, 205];
const CARD_BG: [number, number, number] = [245, 243, 238]; // #f5f3ee

// ── Draw helpers ─────────────────────────────────────────────────────────────

function setColor(doc: jsPDF, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function fillColor(doc: jsPDF, rgb: [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

function strokeColor(doc: jsPDF, rgb: [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

/** Draw a severity badge pill: text only, no dot. Right-padded from edge. */
function drawSeverityBadge(
  doc: jsPDF,
  severity: AnnotationSeverity,
  xRight: number, // right content edge
  y: number, // top y of badge
): number {
  const rgb = SEVERITY_RGB[severity];
  const label = PDF_LABEL[severity];
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  const tw = doc.getTextWidth(label);
  const ph = 4.5; // pill height mm
  const pw2 = tw + 6; // pill width: text + horizontal padding (no dot)
  const px = xRight - pw2 - 3; // 3 mm right margin from card edge

  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(px, y, pw2, ph, 1.2, 1.2, 'S');

  setColor(doc, rgb);
  doc.text(label, px + 3, y + ph - 1.2);

  return pw2 + 3; // include the right margin
}

/** Estimate card height without rendering (for page-break pre-check). */
function estimateCardHeight(finding: AiAnnotation, thumb: { ar: number } | null): number {
  const approxSummaryLines = finding.summary ? Math.ceil(finding.summary.length / 85) : 0;
  const summaryH = approxSummaryLines * 4.2;
  const certLine = finding.confidence != null ? 6 : 0; // single text line
  const imgW = thumb ? Math.min(CW - 20, 120) : 0;
  const thumbH = thumb ? imgW * thumb.ar + 4 : 0;
  return Math.max(6 + 5 + summaryH + certLine + thumbH + 5, 18);
}

/** Draw one finding card. Returns new Y after card. */
function drawFindingCard(
  doc: jsPDF,
  finding: AiAnnotation,
  idx: number, // 1-based display index
  y: number,
  thumb: { data: string; ar: number } | null,
): number {
  const rgb = SEVERITY_RGB[finding.severity];
  const x0 = ML;
  const BAR_W = 1.5;
  const xText = x0 + BAR_W + 8; // 8 mm gap between bar and content

  // Image dimensions — use actual aspect ratio so card height is correct
  const imgW = thumb ? Math.min(CW - 20, 120) : 0;
  const imgH = thumb ? imgW * thumb.ar : 0;
  const thumbH = thumb ? imgH + 4 : 0;

  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  const maxSummaryW = CW - 12;
  const summaryLines = finding.summary ? doc.splitTextToSize(finding.summary, maxSummaryW) : [];
  const summaryH = summaryLines.length * 4.2;
  const certLine = finding.confidence != null ? 6 : 0; // single text line
  const innerH = 6 + 5 + summaryH + certLine + thumbH + 5;
  const cardH = Math.max(innerH, 18);

  // Card background
  fillColor(doc, CARD_BG);
  doc.setLineWidth(0.2);
  doc.rect(x0 + BAR_W, y, CW - BAR_W, cardH, 'F');

  // Fix 3: thin severity bar (1.5 mm)
  fillColor(doc, rgb);
  doc.rect(x0, y, BAR_W, cardH, 'F');

  // Fix 1: index inline with title on same baseline
  doc.setFontSize(8.5);
  doc.setFont('courier', 'normal');
  setColor(doc, INK3);
  const idxStr = `${String(idx).padStart(2, '0')}  `;
  doc.text(idxStr, xText, y + 5.5);
  const idxW = doc.getTextWidth(idxStr);

  // Fix 2: title lighter weight (normal, not bold)
  doc.setFontSize(11);
  doc.setFont('courier', 'normal');
  setColor(doc, INK);
  const badgeReserve = 30;
  const titleW = CW - 12 - idxW - badgeReserve;
  const titleLines = doc.splitTextToSize(finding.label, titleW);
  doc.text(titleLines[0], xText + idxW, y + 5.5);

  // Fix 4: badge — no dot, right-padded
  drawSeverityBadge(doc, finding.severity, XR, y + 1.5);

  let cy = y + 9.5;

  // Location
  doc.setFontSize(7.5);
  doc.setFont('courier', 'normal');
  setColor(doc, INK3);
  // Coordinates always shown — they identify location on the scan
  let locationText =
    `${planeName(finding.plane).toUpperCase()} · SLICE ${sliceNum(finding)}` +
    `  x${finding.voxel.x} · y${finding.voxel.y} · z${finding.voxel.z}`;
  if (finding.sizeMm != null) {
    locationText += `  · o${finding.sizeMm} mm`; // ø not supported in Courier
  }
  doc.text(locationText, xText, cy);
  cy += 5;

  // Summary
  if (summaryLines.length > 0) {
    doc.setFontSize(9);
    doc.setFont('courier', 'normal');
    setColor(doc, INK2);
    doc.text(summaryLines, xText, cy);
    cy += summaryH + 1;
  }

  // Certainty — sparkle bullet + XX% (no bar)
  if (finding.confidence != null) {
    doc.setFontSize(8.5);
    doc.setFont('courier', 'normal');
    // #60a5fa blue — independent of severity
    doc.setTextColor(96, 165, 250);
    doc.text(`Certainty:  ${finding.confidence}%`, xText, cy + 3);
    setColor(doc, INK2); // restore
    cy += certLine;
  }

  // Thumbnail
  if (thumb) {
    cy += 3;
    doc.addImage(thumb.data, 'JPEG', xText, cy, imgW, imgH);
    cy += imgH + 2;
  }

  return y + cardH + 4;
}

// ── Main export ──────────────────────────────────────────────────────────────

export function generateReport(params: ReportParams): Blob {
  const {
    findings,
    allFindings,
    scope,
    volumeMeta,
    scalarMin,
    scalarMax,
    bitsAllocated,
    formatId,
    thumbnails,
    today,
  } = params;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setLineWidth(0.2);

  let y = MT;

  // ── HEADER ──────────────────────────────────────────────────────────────────

  // Logo: Prisma + MRI (italic)
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  setColor(doc, INK);
  doc.text('Prisma', ML, y + 7);
  const prismaW = doc.getTextWidth('Prisma');
  doc.setFont('helvetica', 'bolditalic');
  doc.text('MRI', ML + prismaW, y + 7);

  // Modality sub-line under logo
  if (volumeMeta) {
    const modalityParts = [volumeMeta.modality ?? '', volumeMeta.protocol ?? formatId ?? '']
      .filter(Boolean)
      .map((s) => s.toUpperCase());
    doc.setFontSize(8);
    doc.setFont('courier', 'normal');
    setColor(doc, INK3);
    doc.text(modalityParts.join(' · '), ML, y + 12);
  }

  // Report info — right side
  doc.setFontSize(8);
  doc.setFont('courier', 'bold');
  setColor(doc, INK);
  const reportLabel = 'FINDINGS REPORT';
  doc.text(reportLabel, XR - doc.getTextWidth(reportLabel), y + 3);

  doc.setFont('courier', 'normal');
  setColor(doc, INK3);
  const scopeLabel =
    scope === 'finding' ? 'Single finding' : `All findings · ${allFindings.length}`;
  doc.text(scopeLabel, XR - doc.getTextWidth(scopeLabel), y + 7.5);
  const dateLabel = today;
  doc.text(dateLabel, XR - doc.getTextWidth(dateLabel), y + 12);

  y += 16;

  // Divider
  strokeColor(doc, RULE);
  doc.setLineWidth(0.5);
  doc.line(ML, y, XR, y);
  doc.setLineWidth(0.2);
  y += 7;

  // ── VOLUME METADATA ──────────────────────────────────────────────────────────

  if (volumeMeta) {
    const huRange =
      scalarMin != null && scalarMax != null
        ? `${Math.round(scalarMin)} -> ${Math.round(scalarMax)} HU`
        : '—';

    const meta: Array<[string, string]> = [
      ['PROTOCOL', (volumeMeta.protocol ?? formatId ?? '—').toLowerCase()],
      [
        'MODALITY',
        [volumeMeta.modality ?? 'CT', bitsAllocated ? `${bitsAllocated}-bit` : '', 'HU']
          .filter(Boolean)
          .join(' · '),
      ],
      ['HU RANGE', huRange],
      [
        'VOLUME',
        volumeMeta.dims
          ? `${volumeMeta.dims[0]} × ${volumeMeta.dims[1]} × ${volumeMeta.dims[2]} vox`
          : '—',
      ],
      [
        'SPACING',
        volumeMeta.spacing
          ? `${volumeMeta.spacing[0]} × ${volumeMeta.spacing[1]} × ${volumeMeta.spacing[2]} mm`
          : '—',
      ],
      ['SOURCE', 'Local · in-memory'],
    ];

    for (let i = 0; i < meta.length; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = ML + col * COL3;
      const cy = y + row * 14;

      doc.setFontSize(7);
      doc.setFont('courier', 'normal');
      setColor(doc, INK3);
      doc.text(meta[i][0], cx, cy);

      doc.setFontSize(9);
      setColor(doc, INK);
      doc.text(meta[i][1], cx, cy + 4.5);
    }

    y += 30;

    // Separator
    strokeColor(doc, RULE);
    doc.setLineWidth(0.3);
    doc.line(ML, y, XR, y);
    doc.setLineWidth(0.2);
    y += 8;
  }

  // ── FINDINGS SECTION ─────────────────────────────────────────────────────────

  // Section label
  doc.setFontSize(7);
  doc.setFont('courier', 'normal');
  setColor(doc, INK3);
  const sectionLabel = scope === 'finding' ? 'SELECTED FINDING' : `FINDINGS · ${findings.length}`;
  doc.text(sectionLabel, ML, y);
  y += 6;

  // Cards
  for (const finding of findings) {
    const globalIdx = allFindings.findIndex((f) => f.id === finding.id) + 1;
    const thumb = thumbnails.get(finding.id) ?? null;

    // Fix 5: ensure the whole card fits on the page before drawing
    const h = estimateCardHeight(finding, thumb);
    if (y + h > PH - MB) {
      doc.addPage();
      y = MT;
    }

    y = drawFindingCard(doc, finding, globalIdx, y, thumb);
  }

  // ── NOTE BOX ─────────────────────────────────────────────────────────────────

  const noteText =
    scope === 'finding'
      ? `Isolated export of finding F-${String(
          allFindings.findIndex((f) => f.id === findings[0]?.id) + 1,
        ).padStart(2, '0')}. Full study contains ${allFindings.length} finding${
          allFindings.length !== 1 ? 's' : ''
        } — switch scope to include all findings and the consolidated impression.`
      : 'This is an AI-assisted descriptive read of imaging only. Not a diagnosis. Clinical correlation and review by a qualified radiologist is required before any clinical decision.';

  doc.setFont('courier', 'normal');
  doc.setFontSize(8.5);
  const noteLines = doc.splitTextToSize(noteText, CW - 12);
  const noteH = noteLines.length * 4.2 + 12;

  if (y + noteH > PH - MB) {
    doc.addPage();
    y = MT;
  }

  y += 4;
  fillColor(doc, [240, 238, 232]);
  strokeColor(doc, RULE);
  doc.setLineWidth(0.3);
  doc.rect(ML, y, CW, noteH, 'DF');

  doc.setFontSize(7);
  doc.setFont('courier', 'bold');
  setColor(doc, INK3);
  doc.text('NOTE', ML + 5, y + 5);

  doc.setFontSize(8.5);
  doc.setFont('courier', 'normal');
  setColor(doc, INK2);
  doc.text(noteLines, ML + 5, y + 10);

  // Return as Blob
  return doc.output('blob');
}
