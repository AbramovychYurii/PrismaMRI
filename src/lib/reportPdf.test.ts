// @vitest-environment happy-dom
import type { Annotation, AnnotationSeverity } from '@prisma-mri/viewer-core';
import { defaultTheme } from '@prisma-mri/viewer-react';
import { describe, expect, it } from 'vitest';
import { generateReport } from './reportPdf';

const SEVERITIES: AnnotationSeverity[] = ['critical', 'serious', 'moderate', 'comment'];

function finding(severity: AnnotationSeverity, i: number): Annotation {
  return {
    id: `f${i}`,
    volumeId: 'vol',
    plane: 'axial',
    fx: 0.5,
    fy: 0.5,
    voxel: { x: 10 + i, y: 20, z: 30 },
    label: `Finding ${severity}`,
    summary: `A ${severity} finding.`,
    severity,
    confidence: 70,
    sizeMm: 4,
  };
}

async function pdfText(findings: Annotation[], scope: 'finding' | 'all'): Promise<string> {
  const blob = generateReport({
    findings,
    allFindings: findings,
    scope,
    volumeMeta: null,
    thumbnails: new Map(),
    today: '2026-01-01',
  });
  expect(blob.type).toBe('application/pdf');
  return new Response(blob).text();
}

/** The colours a PDF paints with, as 0–1 triples (jsPDF trims their digits: `1. 0.23 0.19`). */
function paints(pdf: string): [number, number, number][] {
  return [...pdf.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) (?:rg|RG)/g)].map(
    (m) => [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number],
  );
}

function hasColour(pdf: string, hex: string): boolean {
  const v = Number.parseInt(hex.slice(1), 16);
  const want = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((n) => n / 255);
  return paints(pdf).some((p) => p.every((n, i) => Math.abs(n - want[i]) < 0.006));
}

describe('generateReport', () => {
  it('writes a PDF with one entry per finding', async () => {
    const text = await pdfText(SEVERITIES.map(finding), 'all');
    expect(text.startsWith('%PDF-')).toBe(true);
    for (const severity of SEVERITIES) {
      expect(text, severity).toContain(`Finding ${severity}`);
    }
    expect(text).toContain('SLICE'); // the location line: plane · slice · voxel
  });

  it("paints each severity in the theme's colour", async () => {
    for (const [i, severity] of SEVERITIES.entries()) {
      const text = await pdfText([finding(severity, i)], 'finding');
      expect(hasColour(text, defaultTheme.severity[severity]), severity).toBe(true);
    }
  });

  it('names the plane and counts slices from one', async () => {
    const text = await pdfText([finding('serious', 0)], 'finding');
    expect(text).toContain('AXIAL');
    expect(text).toMatch(/SLICE \d+/);
  });
});
