/**
 * Zero-dependency DICOM reader.
 *
 * Supports the two transfer syntaxes that cover the overwhelming majority of
 * stored datasets: Implicit VR Little Endian and Explicit VR Little Endian.
 * The 128-byte preamble + "DICM" marker is optional; the (0002,xxxx) file
 * meta group is optional. VR scheme is auto-detected by inspecting the bytes
 * that follow the first data-set tag.
 */

const EXPLICIT_LONG_VR = new Set(['OB', 'OW', 'OF', 'OD', 'OL', 'SQ', 'UC', 'UR', 'UT', 'UN']);

export interface DicomTags {
  rows: number;
  columns: number;
  bitsAllocated: number;
  pixelRepresentation: number;
  samplesPerPixel: number;
  rescaleSlope: number;
  rescaleIntercept: number;
  windowCenter?: number;
  windowWidth?: number;
  pixelSpacing: [number, number];
  sliceThickness?: number;
  imagePositionPatient?: [number, number, number];
  imageOrientationPatient?: number[];
  instanceNumber?: number;
  sliceLocation?: number;
  studyId?: string;
  studyDate?: string;
  studyTime?: string;
  modality?: string;
  manufacturer?: string;
  seriesDescription?: string;
  numberOfFrames: number;
  pixelDataOffset: number;
  pixelDataLength: number;
}

type Tag = number; // (group << 16) | element

const T = {
  Modality: 0x00080060,
  Manufacturer: 0x00080070,
  StudyDate: 0x00080020,
  StudyTime: 0x00080030,
  SeriesDescription: 0x0008103e,
  StudyID: 0x00200010,
  InstanceNumber: 0x00200013,
  ImagePosition: 0x00200032,
  ImageOrientation: 0x00200037,
  SliceLocation: 0x00201041,
  SamplesPerPixel: 0x00280002,
  Rows: 0x00280010,
  Columns: 0x00280011,
  NumberOfFrames: 0x00280008,
  PixelSpacing: 0x00280030,
  SliceThickness: 0x00180050,
  BitsAllocated: 0x00280100,
  PixelRepresentation: 0x00280103,
  WindowCenter: 0x00281050,
  WindowWidth: 0x00281051,
  RescaleIntercept: 0x00281052,
  RescaleSlope: 0x00281053,
  PixelData: 0x7fe00010,
} as const;

function asTag(group: number, element: number): Tag {
  return ((group << 16) | element) >>> 0;
}

function decodeString(view: DataView, offset: number, length: number): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
  return new TextDecoder('latin1').decode(bytes).replace(/\0+$/, '').trim();
}

function parseNumberList(s: string): number[] {
  return s
    .split('\\')
    .map((v) => Number.parseFloat(v))
    .filter((n) => Number.isFinite(n));
}

function isUpperAlpha(c: number): boolean {
  return c >= 0x41 && c <= 0x5a;
}

/** Detect whether the data set after `start` is Explicit VR. */
function detectExplicit(view: DataView, start: number): boolean {
  // tag = 4 bytes, then 2 bytes that are either a VR (explicit) or low word
  // of a 4-byte length (implicit).
  if (start + 6 > view.byteLength) return false;
  const b0 = view.getUint8(start + 4);
  const b1 = view.getUint8(start + 5);
  return isUpperAlpha(b0) && isUpperAlpha(b1);
}

export function resolveDicomHeaderReadLength(fileSize: number): number {
  // Header (everything but pixel data) is small; 64 KB is ample for scanning.
  return Math.min(fileSize, 65536);
}

/**
 * Parse a DICOM byte buffer. If `headerOnly`, pixel data is located but not
 * required to be present in the buffer (used for fast folder scans).
 */
export function parseImplicitLittleEndianDicom(
  buffer: ArrayBuffer,
  headerOnly = false,
): DicomTags | null {
  const view = new DataView(buffer);
  if (view.byteLength < 8) return null;

  let offset = 0;
  // Optional 128-byte preamble + "DICM"
  if (view.byteLength > 132) {
    const magic = decodeString(view, 128, 4);
    if (magic === 'DICM') offset = 132;
  }

  // Optional file meta group (0002,xxxx) is always Explicit VR LE.
  let transferSyntax = '';
  if (offset + 6 <= view.byteLength && view.getUint16(offset, true) === 0x0002) {
    const metaExplicit = detectExplicit(view, offset);
    while (offset + 8 <= view.byteLength && view.getUint16(offset, true) === 0x0002) {
      const r = readElement(view, offset, metaExplicit, true);
      if (!r) break;
      if (r.tag === asTag(0x0002, 0x0010)) {
        transferSyntax = decodeString(view, r.valueOffset, r.length);
      }
      offset = r.next;
    }
  }

  const explicit =
    transferSyntax === '1.2.840.10008.1.2.1'
      ? true
      : transferSyntax === '1.2.840.10008.1.2'
        ? false
        : detectExplicit(view, offset);

  const tags: Partial<DicomTags> = {
    rescaleSlope: 1,
    rescaleIntercept: 0,
    samplesPerPixel: 1,
    numberOfFrames: 1,
  };

  while (offset + 8 <= view.byteLength) {
    const r = readElement(view, offset, explicit, false);
    if (!r) break;

    switch (r.tag) {
      case T.Modality:
        tags.modality = decodeString(view, r.valueOffset, r.length);
        break;
      case T.Manufacturer:
        tags.manufacturer = decodeString(view, r.valueOffset, r.length);
        break;
      case T.StudyDate:
        tags.studyDate = decodeString(view, r.valueOffset, r.length);
        break;
      case T.StudyTime:
        tags.studyTime = decodeString(view, r.valueOffset, r.length);
        break;
      case T.SeriesDescription:
        tags.seriesDescription = decodeString(view, r.valueOffset, r.length);
        break;
      case T.StudyID:
        tags.studyId = decodeString(view, r.valueOffset, r.length);
        break;
      case T.InstanceNumber:
        tags.instanceNumber = Number.parseInt(decodeString(view, r.valueOffset, r.length), 10);
        break;
      case T.ImagePosition: {
        const p = parseNumberList(decodeString(view, r.valueOffset, r.length));
        if (p.length >= 3) tags.imagePositionPatient = [p[0], p[1], p[2]];
        break;
      }
      case T.ImageOrientation:
        tags.imageOrientationPatient = parseNumberList(
          decodeString(view, r.valueOffset, r.length),
        );
        break;
      case T.SliceLocation:
        tags.sliceLocation = Number.parseFloat(decodeString(view, r.valueOffset, r.length));
        break;
      case T.SamplesPerPixel:
        tags.samplesPerPixel = view.getUint16(r.valueOffset, true);
        break;
      case T.Rows:
        tags.rows = view.getUint16(r.valueOffset, true);
        break;
      case T.Columns:
        tags.columns = view.getUint16(r.valueOffset, true);
        break;
      case T.NumberOfFrames:
        tags.numberOfFrames =
          Number.parseInt(decodeString(view, r.valueOffset, r.length), 10) || 1;
        break;
      case T.PixelSpacing: {
        const ps = parseNumberList(decodeString(view, r.valueOffset, r.length));
        if (ps.length >= 2) tags.pixelSpacing = [ps[0], ps[1]];
        break;
      }
      case T.SliceThickness:
        tags.sliceThickness = Number.parseFloat(decodeString(view, r.valueOffset, r.length));
        break;
      case T.BitsAllocated:
        tags.bitsAllocated = view.getUint16(r.valueOffset, true);
        break;
      case T.PixelRepresentation:
        tags.pixelRepresentation = view.getUint16(r.valueOffset, true);
        break;
      case T.WindowCenter:
        tags.windowCenter = parseNumberList(decodeString(view, r.valueOffset, r.length))[0];
        break;
      case T.WindowWidth:
        tags.windowWidth = parseNumberList(decodeString(view, r.valueOffset, r.length))[0];
        break;
      case T.RescaleIntercept:
        tags.rescaleIntercept =
          Number.parseFloat(decodeString(view, r.valueOffset, r.length)) || 0;
        break;
      case T.RescaleSlope:
        tags.rescaleSlope =
          Number.parseFloat(decodeString(view, r.valueOffset, r.length)) || 1;
        break;
      case T.PixelData:
        tags.pixelDataOffset = r.valueOffset;
        tags.pixelDataLength =
          r.length === 0xffffffff ? view.byteLength - r.valueOffset : r.length;
        if (headerOnly) {
          return finalize(tags);
        }
        return finalize(tags);
    }
    offset = r.next;
  }

  return finalize(tags);
}

interface ElementRead {
  tag: Tag;
  vr: string;
  length: number;
  valueOffset: number;
  next: number;
}

function readElement(
  view: DataView,
  offset: number,
  explicit: boolean,
  metaGroup: boolean,
): ElementRead | null {
  if (offset + 8 > view.byteLength) return null;
  const group = view.getUint16(offset, true);
  const element = view.getUint16(offset + 2, true);
  const tag = asTag(group, element);
  let p = offset + 4;
  let vr = '';
  let length: number;

  if (explicit || metaGroup) {
    vr = decodeString(view, p, 2);
    p += 2;
    if (EXPLICIT_LONG_VR.has(vr)) {
      p += 2; // reserved
      length = view.getUint32(p, true);
      p += 4;
    } else {
      length = view.getUint16(p, true);
      p += 2;
    }
  } else {
    length = view.getUint32(p, true);
    p += 4;
  }

  // Undefined length (sequences / encapsulated) — bail to keep parser linear.
  if (length === 0xffffffff && tag !== T.PixelData) {
    return { tag, vr, length: 0, valueOffset: p, next: p };
  }
  const next = tag === T.PixelData && length === 0xffffffff ? view.byteLength : p + length;
  return { tag, vr, length, valueOffset: p, next };
}

function finalize(t: Partial<DicomTags>): DicomTags | null {
  if (!t.rows || !t.columns) return null;
  return {
    rows: t.rows,
    columns: t.columns,
    bitsAllocated: t.bitsAllocated ?? 16,
    pixelRepresentation: t.pixelRepresentation ?? 0,
    samplesPerPixel: t.samplesPerPixel ?? 1,
    rescaleSlope: t.rescaleSlope ?? 1,
    rescaleIntercept: t.rescaleIntercept ?? 0,
    windowCenter: t.windowCenter,
    windowWidth: t.windowWidth,
    pixelSpacing: t.pixelSpacing ?? [1, 1],
    sliceThickness: t.sliceThickness,
    imagePositionPatient: t.imagePositionPatient,
    imageOrientationPatient: t.imageOrientationPatient,
    instanceNumber: t.instanceNumber,
    sliceLocation: t.sliceLocation,
    studyId: t.studyId,
    studyDate: t.studyDate,
    studyTime: t.studyTime,
    modality: t.modality,
    manufacturer: t.manufacturer,
    seriesDescription: t.seriesDescription,
    numberOfFrames: t.numberOfFrames ?? 1,
    pixelDataOffset: t.pixelDataOffset ?? -1,
    pixelDataLength: t.pixelDataLength ?? 0,
  };
}

/**
 * Per-slice sort key projected onto the slice-normal axis (cross product of
 * the row/column orientation vectors), falling back to slice location then
 * instance number.
 */
export function computeDicomSliceLocation(t: DicomTags): number {
  const iop = t.imageOrientationPatient;
  const ipp = t.imagePositionPatient;
  if (iop && iop.length >= 6 && ipp) {
    const r = [iop[0], iop[1], iop[2]];
    const c = [iop[3], iop[4], iop[5]];
    const n = [
      r[1] * c[2] - r[2] * c[1],
      r[2] * c[0] - r[0] * c[2],
      r[0] * c[1] - r[1] * c[0],
    ];
    return ipp[0] * n[0] + ipp[1] * n[1] + ipp[2] * n[2];
  }
  if (t.sliceLocation !== undefined && Number.isFinite(t.sliceLocation)) {
    return t.sliceLocation;
  }
  return t.instanceNumber ?? 0;
}

export function sortDicomSlices<S extends { tags: DicomTags }>(slices: S[]): S[] {
  return slices
    .map((s) => ({ s, key: computeDicomSliceLocation(s.tags) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.s);
}
