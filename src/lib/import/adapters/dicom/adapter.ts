import type { LoadedVolume, Vec3 } from '@/types';
import { resolveWindowLevel } from '@/lib/volume/math';
import type { ImportFormatAdapter, ImportSource, ProgressFn } from '@/lib/import/types';
import { parseImplicitLittleEndianDicom, sortDicomSlices, type DicomTags } from '@/lib/import/adapters/dicom/reader';

function isDicomName(name: string): boolean {
  return name.endsWith('.dcm') || name.endsWith('.dicom') || name.endsWith('.ima');
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
  matches(source) {
    return source.files.some((f) => isDicomName(f.name));
  },
  async parse(source: ImportSource, onProgress: ProgressFn): Promise<LoadedVolume> {
    let candidates = source.files.filter((f) => isDicomName(f.name));
    if (candidates.length === 0) {
      const checks = await Promise.all(
        source.files.map(async (f) => ((await looksLikeDicom(f.file)) ? f : null)),
      );
      candidates = checks.filter((f): f is NonNullable<typeof f> => f !== null);
    }
    if (candidates.length === 0) throw new Error('No DICOM files found in selection.');

    onProgress({ stage: 'parsing-headers', current: 0, total: candidates.length });

    const slices: { buffer: ArrayBuffer; tags: DicomTags }[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const buffer = await candidates[i].file.arrayBuffer();
      const tags = parseImplicitLittleEndianDicom(buffer, false);
      if (tags && tags.pixelDataOffset >= 0) slices.push({ buffer, tags });
      onProgress({ stage: 'reading-files', current: i + 1, total: candidates.length });
    }
    if (slices.length === 0) throw new Error('DICOM files contained no readable pixel data.');

    const sorted = sortDicomSlices(slices);
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
    if (sorted.length > 1 && sorted[0].tags.imagePositionPatient && sorted[1].tags.imagePositionPatient) {
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
      windowLevel: resolveWindowLevel(
        scalarMin,
        scalarMax,
        first.windowCenter,
        first.windowWidth,
      ),
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
