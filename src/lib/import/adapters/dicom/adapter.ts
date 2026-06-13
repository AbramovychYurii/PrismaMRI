import {
  type DicomTags,
  parseImplicitLittleEndianDicom,
  resolveDicomHeaderReadLength,
  sortDicomSlices,
} from '@/lib/import/adapters/dicom/reader';
import type {
  ImportFile,
  ImportFormatAdapter,
  ImportSource,
  ProgressFn,
  SeriesChoice,
} from '@/lib/import/types';
import { resolveWindowLevel } from '@/lib/volume/math';
import type { LoadedVolume, Vec3 } from '@/types';

function isDicomName(name: string): boolean {
  return name.endsWith('.dcm') || name.endsWith('.dicom') || name.endsWith('.ima');
}

/**
 * Files that are DICOM by extension, else by content sniff. Shared by
 * `listSeries` and `parse` so both see the same candidate set.
 */
async function collectCandidates(source: ImportSource): Promise<ImportFile[]> {
  const named = source.files.filter((f) => isDicomName(f.name));
  if (named.length > 0) return named;
  const checks = await Promise.all(
    source.files.map(async (f) => ((await looksLikeDicom(f.file)) ? f : null)),
  );
  return checks.filter((f): f is ImportFile => f !== null);
}

async function looksLikeDicom(file: File): Promise<boolean> {
  if (file.size < 8) return false;
  const head = await file.slice(0, 136).arrayBuffer();
  const v = new DataView(head);
  if (v.byteLength >= 132) {
    const magic = String.fromCharCode(
      v.getUint8(128),
      v.getUint8(129),
      v.getUint8(130),
      v.getUint8(131),
    );
    if (magic === 'DICM') return true;
  }
  // No preamble — first tag group is typically 0x0008 or 0x0002.
  const g = v.getUint16(0, true);
  return g === 0x0008 || g === 0x0002;
}

type Slice = { buffer: ArrayBuffer; tags: DicomTags };

/** Group key for one series: prefer SeriesInstanceUID, else geometry. */
function seriesKeyOf(t: DicomTags): string {
  if (t.seriesInstanceUid) return t.seriesInstanceUid;
  const iop = t.imageOrientationPatient?.map((x) => Math.round(x)).join(',') ?? '';
  return `${t.columns}x${t.rows}|${iop}`;
}

/** Group slices by series key, preserving first-seen order. */
function groupBySeries<T extends { tags: DicomTags }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = seriesKeyOf(it.tags);
    const g = groups.get(k);
    if (g) g.push(it);
    else groups.set(k, [it]);
  }
  return groups;
}

/** Pick the group with the most slices; ties broken by the finer matrix. */
function largestGroup<T extends { tags: DicomTags }>(groups: Map<string, T[]>): T[] {
  return [...groups.values()].reduce((best, g) => {
    if (g.length !== best.length) return g.length > best.length ? g : best;
    const a = g[0].tags;
    const b = best[0].tags;
    return a.columns * a.rows > b.columns * b.rows ? g : best;
  });
}

/** Dominant anatomical plane from the image-orientation cosines. */
function orientationOf(t: DicomTags): SeriesChoice['orientation'] {
  const iop = t.imageOrientationPatient;
  if (!iop || iop.length < 6) return undefined;
  const r = [iop[0], iop[1], iop[2]];
  const c = [iop[3], iop[4], iop[5]];
  const n = [r[1] * c[2] - r[2] * c[1], r[2] * c[0] - r[0] * c[2], r[0] * c[1] - r[1] * c[0]].map(
    Math.abs,
  );
  const max = Math.max(n[0], n[1], n[2]);
  // A clean primary axis is ~1 on one component; anything else is oblique.
  if (max < 0.9) return 'Oblique';
  if (max === n[2]) return 'Axial';
  if (max === n[0]) return 'Sagittal';
  return 'Coronal';
}

function readPixels(buffer: ArrayBuffer, t: DicomTags): Float32Array {
  const count = t.rows * t.columns * t.numberOfFrames;
  const out = new Float32Array(count);
  const { rescaleSlope: m, rescaleIntercept: b } = t;
  const dv = new DataView(buffer, t.pixelDataOffset);
  if (t.bitsAllocated === 16) {
    if (t.pixelRepresentation === 1) {
      for (let i = 0; i < count; i++) out[i] = dv.getInt16(i * 2, true) * m + b;
    } else {
      for (let i = 0; i < count; i++) out[i] = dv.getUint16(i * 2, true) * m + b;
    }
  } else if (t.bitsAllocated === 8) {
    for (let i = 0; i < count; i++) out[i] = dv.getUint8(i) * m + b;
  } else if (t.bitsAllocated === 32) {
    for (let i = 0; i < count; i++) out[i] = dv.getFloat32(i * 4, true) * m + b;
  }
  return out;
}

export const dicomAdapter: ImportFormatAdapter = {
  id: 'dicom',
  label: 'DICOM series',
  async matches(source) {
    // Fast path: a recognised extension (.dcm/.dicom/.ima).
    if (source.files.some((f) => isDicomName(f.name))) return true;
    // Many PACS exports are extensionless (e.g. PA…/ST…/SE…/IM000000), so fall
    // back to sniffing the "DICM" magic / first-tag group. Stop at the first
    // hit so a real series is detected without reading every file.
    for (const f of source.files) {
      if (await looksLikeDicom(f.file)) return true;
    }
    return false;
  },
  async listSeries(source: ImportSource): Promise<SeriesChoice[]> {
    const candidates = await collectCandidates(source);
    // Header-only read (≤64 KB/file) — pixel data is not needed to enumerate.
    const headers: { tags: DicomTags }[] = [];
    for (const c of candidates) {
      const len = resolveDicomHeaderReadLength(c.file.size);
      const buffer = await c.file.slice(0, len).arrayBuffer();
      const tags = parseImplicitLittleEndianDicom(buffer, true);
      if (tags) headers.push({ tags });
    }
    const groups = groupBySeries(headers);
    return [...groups.entries()]
      .map(([key, g]): SeriesChoice => {
        const t = g[0].tags;
        return {
          key,
          label: t.seriesDescription?.trim() || `Series ${t.studyId ?? ''}`.trim() || 'Series',
          count: g.length,
          rows: t.rows,
          columns: t.columns,
          modality: t.modality,
          orientation: orientationOf(t),
        };
      })
      .sort((a, b) => b.count - a.count);
  },
  async parse(
    source: ImportSource,
    onProgress: ProgressFn,
    seriesKey?: string,
  ): Promise<LoadedVolume> {
    const candidates = await collectCandidates(source);
    if (candidates.length === 0) throw new Error('No DICOM files found in selection.');

    onProgress({ stage: 'parsing-headers', current: 0, total: candidates.length });

    const slices: Slice[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const buffer = await candidates[i].file.arrayBuffer();
      const tags = parseImplicitLittleEndianDicom(buffer, false);
      if (tags && tags.pixelDataOffset >= 0) slices.push({ buffer, tags });
      onProgress({ stage: 'reading-files', current: i + 1, total: candidates.length });
    }
    if (slices.length === 0) throw new Error('DICOM files contained no readable pixel data.');

    // A folder or zip frequently bundles several series (different orientation,
    // contrast, matrix size — even multiple studies). Concatenating them into a
    // single grid yields an incoherent "accordion" volume, so assemble exactly
    // one series: the caller's chosen `seriesKey`, else the largest one.
    const groups = groupBySeries(slices);
    const picked = seriesKey
      ? (groups.get(seriesKey) ?? largestGroup(groups))
      : largestGroup(groups);
    const sorted = sortDicomSlices(picked);
    const first = sorted[0].tags;
    const width = first.columns;
    const height = first.rows;
    const depth = sorted.reduce((n, s) => n + s.tags.numberOfFrames, 0);

    onProgress({ stage: 'assembling', current: 0, total: depth });

    const voxels = new Float32Array(width * height * depth);
    let zOff = 0;
    let scalarMin = Number.POSITIVE_INFINITY;
    let scalarMax = Number.NEGATIVE_INFINITY;
    for (let s = 0; s < sorted.length; s++) {
      const { buffer, tags } = sorted[s];
      if (tags.columns !== width || tags.rows !== height) continue;
      const px = readPixels(buffer, tags);
      voxels.set(px, zOff * width * height);
      for (let i = 0; i < px.length; i++) {
        const v = px[i];
        if (v < scalarMin) scalarMin = v;
        if (v > scalarMax) scalarMax = v;
      }
      zOff += tags.numberOfFrames;
      onProgress({ stage: 'assembling', current: zOff, total: depth });
    }

    // Z spacing from slice position delta, else slice thickness, else 1.
    let zSpacing = first.sliceThickness ?? 1;
    if (
      sorted.length > 1 &&
      sorted[0].tags.imagePositionPatient &&
      sorted[1].tags.imagePositionPatient
    ) {
      const a = sorted[0].tags.imagePositionPatient;
      const b = sorted[1].tags.imagePositionPatient;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (d > 0) zSpacing = d;
    }
    const spacing: Vec3 = [first.pixelSpacing[1], first.pixelSpacing[0], zSpacing];

    return {
      voxels,
      meta: {
        studyId: first.studyId,
        acquired: formatAcquired(first.studyDate, first.studyTime),
        protocol: first.seriesDescription,
        scanner: first.manufacturer,
        modality: first.modality ?? 'CT',
        spacing,
        origin: first.imagePositionPatient ?? [0, 0, 0],
        dims: [width, height, depth],
        bitsAllocated: first.bitsAllocated,
        rescaleSlope: first.rescaleSlope,
        rescaleIntercept: first.rescaleIntercept,
      },
      scalarMin,
      scalarMax,
      windowLevel: resolveWindowLevel(scalarMin, scalarMax, first.windowCenter, first.windowWidth),
      formatId: 'dicom',
    };
  },
};

function formatAcquired(date?: string, time?: string): string | undefined {
  if (!date || date.length < 8) return undefined;
  const y = date.slice(0, 4);
  const m = date.slice(4, 6);
  const d = date.slice(6, 8);
  const hm = time && time.length >= 4 ? ` ${time.slice(0, 2)}:${time.slice(2, 4)} UTC` : '';
  return `${y} · ${m} · ${d}${hm}`;
}
