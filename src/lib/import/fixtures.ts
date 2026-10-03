/**
 * Builders for synthetic import sources — used by the adapter and loader tests
 * only. Each one writes the smallest valid file of its format byte by byte, so
 * a test states exactly which header fields it depends on.
 */
import type { ImportSource } from '@/lib/import/types';

export function sourceOf(...files: { name: string; bytes: Uint8Array }[]): ImportSource {
  return {
    rootName: 'test',
    files: files.map(({ name, bytes }) => ({
      path: name,
      name: name.toLowerCase(),
      file: new File([bytes as Uint8Array<ArrayBuffer>], name),
    })),
  };
}

export function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export type NumberKind = 'i8' | 'u8' | 'i16' | 'u16' | 'i32' | 'u32' | 'f32' | 'f64';

const BYTES: Record<NumberKind, number> = {
  i8: 1,
  u8: 1,
  i16: 2,
  u16: 2,
  i32: 4,
  u32: 4,
  f32: 4,
  f64: 8,
};

export function pack(kind: NumberKind, values: number[], littleEndian = true): Uint8Array {
  const size = BYTES[kind];
  const out = new Uint8Array(values.length * size);
  const view = new DataView(out.buffer);
  values.forEach((value, i) => {
    const o = i * size;
    if (kind === 'i8') view.setInt8(o, value);
    else if (kind === 'u8') view.setUint8(o, value);
    else if (kind === 'i16') view.setInt16(o, value, littleEndian);
    else if (kind === 'u16') view.setUint16(o, value, littleEndian);
    else if (kind === 'i32') view.setInt32(o, value, littleEndian);
    else if (kind === 'u32') view.setUint32(o, value, littleEndian);
    else if (kind === 'f32') view.setFloat32(o, value, littleEndian);
    else view.setFloat64(o, value, littleEndian);
  });
  return out;
}

// ── NIfTI-1 ──────────────────────────────────────────────────────────────────

export interface NiftiOptions {
  dims: [number, number, number];
  datatype: number;
  bitpix: number;
  data: Uint8Array;
  pixdim?: [number, number, number];
  slope?: number;
  intercept?: number;
  littleEndian?: boolean;
  /** Where the voxels start; 352 for a single-file .nii, 0 for an .img pair. */
  voxOffset?: number;
  /** 'n+1' (single file) or 'ni1' (.hdr/.img pair). */
  magic?: 'n+1' | 'ni1';
}

/** A NIfTI-1 header, followed by the voxels when `voxOffset` > 0. */
export function niftiBytes(o: NiftiOptions): Uint8Array {
  const le = o.littleEndian ?? true;
  const voxOffset = o.voxOffset ?? 352;
  const headerLength = Math.max(348, voxOffset);
  const out = new Uint8Array(headerLength + (voxOffset > 0 ? o.data.length : 0));
  const view = new DataView(out.buffer);
  view.setInt32(0, 348, le);
  view.setInt16(40, 3, le);
  view.setInt16(42, o.dims[0], le);
  view.setInt16(44, o.dims[1], le);
  view.setInt16(46, o.dims[2], le);
  view.setInt16(70, o.datatype, le);
  view.setInt16(72, o.bitpix, le);
  const [px, py, pz] = o.pixdim ?? [1, 1, 1];
  view.setFloat32(80, px, le);
  view.setFloat32(84, py, le);
  view.setFloat32(88, pz, le);
  view.setFloat32(108, voxOffset, le);
  view.setFloat32(112, o.slope ?? 1, le);
  view.setFloat32(116, o.intercept ?? 0, le);
  out.set(ascii(`${o.magic ?? 'n+1'}\0`), 344);
  if (voxOffset > 0) out.set(o.data, voxOffset);
  return out;
}

// ── DICOM ────────────────────────────────────────────────────────────────────

const LONG_VR = new Set(['OB', 'OW', 'OF', 'SQ', 'UT', 'UN']);

function padEven(bytes: Uint8Array, pad: number): Uint8Array {
  return bytes.length % 2 === 0 ? bytes : concat(bytes, Uint8Array.of(pad));
}

function element(
  group: number,
  elem: number,
  vr: string,
  value: Uint8Array,
  explicit: boolean,
): Uint8Array {
  const tag = new Uint8Array(4);
  const tagView = new DataView(tag.buffer);
  tagView.setUint16(0, group, true);
  tagView.setUint16(2, elem, true);
  if (!explicit) {
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, value.length, true);
    return concat(tag, length, value);
  }
  if (LONG_VR.has(vr)) {
    const header = new Uint8Array(8);
    header.set(ascii(vr), 0);
    new DataView(header.buffer).setUint32(4, value.length, true);
    return concat(tag, header, value);
  }
  const header = new Uint8Array(4);
  header.set(ascii(vr), 0);
  new DataView(header.buffer).setUint16(2, value.length, true);
  return concat(tag, header, value);
}

const str = (s: string) => padEven(ascii(s), 0x20);
const uid = (s: string) => padEven(ascii(s), 0x00);
const us = (n: number) => pack('u16', [n]);

export interface DicomSliceOptions {
  rows: number;
  columns: number;
  /** Raw stored values, row-major. */
  pixels: number[];
  /** 'explicit' (Explicit VR LE with preamble + meta) or 'implicit' (bare data set). */
  syntax?: 'explicit' | 'implicit';
  /** Overrides the transfer syntax written to the meta group. */
  transferSyntax?: string;
  bitsAllocated?: 8 | 16;
  signed?: boolean;
  samplesPerPixel?: number;
  pixelSpacing?: [number, number];
  position?: [number, number, number];
  orientation?: number[];
  instanceNumber?: number;
  seriesUid?: string;
  seriesDescription?: string;
  studyId?: string;
  studyDate?: string;
  studyTime?: string;
  modality?: string;
  manufacturer?: string;
  slope?: number;
  intercept?: number;
  windowCenter?: number;
  windowWidth?: number;
  sliceThickness?: number;
  /** Writes PixelData with undefined length, as encapsulated (compressed) data does. */
  encapsulated?: boolean;
}

export function dicomBytes(o: DicomSliceOptions): Uint8Array {
  const explicit = (o.syntax ?? 'explicit') === 'explicit';
  const el = (g: number, e: number, vr: string, v: Uint8Array) => element(g, e, vr, v, explicit);
  const ds = (values: number[]) => str(values.join('\\'));
  const bits = o.bitsAllocated ?? 16;
  const pixelKind: NumberKind = bits === 8 ? 'u8' : o.signed ? 'i16' : 'u16';

  const parts: Uint8Array[] = [];
  if (explicit) {
    parts.push(new Uint8Array(128), ascii('DICM'));
    parts.push(element(0x0002, 0x0010, 'UI', uid(o.transferSyntax ?? '1.2.840.10008.1.2.1'), true));
  }
  if (o.studyDate) parts.push(el(0x0008, 0x0020, 'DA', str(o.studyDate)));
  if (o.studyTime) parts.push(el(0x0008, 0x0030, 'TM', str(o.studyTime)));
  parts.push(el(0x0008, 0x0060, 'CS', str(o.modality ?? 'CT')));
  if (o.manufacturer) parts.push(el(0x0008, 0x0070, 'LO', str(o.manufacturer)));
  if (o.seriesDescription) parts.push(el(0x0008, 0x103e, 'LO', str(o.seriesDescription)));
  if (o.sliceThickness !== undefined) parts.push(el(0x0018, 0x0050, 'DS', ds([o.sliceThickness])));
  if (o.seriesUid) parts.push(el(0x0020, 0x000e, 'UI', uid(o.seriesUid)));
  if (o.studyId) parts.push(el(0x0020, 0x0010, 'SH', str(o.studyId)));
  if (o.instanceNumber !== undefined) {
    parts.push(el(0x0020, 0x0013, 'IS', str(String(o.instanceNumber))));
  }
  if (o.position) parts.push(el(0x0020, 0x0032, 'DS', ds(o.position)));
  parts.push(el(0x0020, 0x0037, 'DS', ds(o.orientation ?? [1, 0, 0, 0, 1, 0])));
  parts.push(el(0x0028, 0x0002, 'US', us(o.samplesPerPixel ?? 1)));
  parts.push(el(0x0028, 0x0010, 'US', us(o.rows)));
  parts.push(el(0x0028, 0x0011, 'US', us(o.columns)));
  parts.push(el(0x0028, 0x0030, 'DS', ds(o.pixelSpacing ?? [1, 1])));
  parts.push(el(0x0028, 0x0100, 'US', us(bits)));
  parts.push(el(0x0028, 0x0103, 'US', us(o.signed ? 1 : 0)));
  if (o.windowCenter !== undefined) parts.push(el(0x0028, 0x1050, 'DS', ds([o.windowCenter])));
  if (o.windowWidth !== undefined) parts.push(el(0x0028, 0x1051, 'DS', ds([o.windowWidth])));
  if (o.intercept !== undefined) parts.push(el(0x0028, 0x1052, 'DS', ds([o.intercept])));
  if (o.slope !== undefined) parts.push(el(0x0028, 0x1053, 'DS', ds([o.slope])));

  const pixels = padEven(pack(pixelKind, o.pixels), 0);
  if (o.encapsulated) {
    const header = new Uint8Array(12);
    const view = new DataView(header.buffer);
    view.setUint16(0, 0x7fe0, true);
    view.setUint16(2, 0x0010, true);
    header.set(ascii('OB'), 4);
    view.setUint32(8, 0xffffffff, true);
    parts.push(header, pixels);
  } else {
    parts.push(el(0x7fe0, 0x0010, bits === 8 ? 'OB' : 'OW', pixels));
  }
  return concat(...parts);
}
