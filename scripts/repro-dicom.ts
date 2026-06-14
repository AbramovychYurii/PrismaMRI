import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import {
  parseImplicitLittleEndianDicom,
  sortDicomSlices,
} from '../src/lib/import/adapters/dicom/reader';

const ZIP = '/Users/yurii/Desktop/Yurii_Abramovych_Head_Neck_DICOM.zip';

// Read transfer-syntax UID directly (the reader keeps it internal).
function transferSyntax(buf: ArrayBuffer): string {
  const v = new DataView(buf);
  let off = 0;
  if (v.byteLength > 132) {
    const m = String.fromCharCode(v.getUint8(128), v.getUint8(129), v.getUint8(130), v.getUint8(131));
    if (m === 'DICM') off = 132;
  }
  while (off + 8 <= v.byteLength && v.getUint16(off, true) === 0x0002) {
    const group = v.getUint16(off, true);
    const element = v.getUint16(off + 2, true);
    let p = off + 4;
    const vr = String.fromCharCode(v.getUint8(p), v.getUint8(p + 1));
    p += 2;
    let len: number;
    if (['OB', 'OW', 'OF', 'SQ', 'UT', 'UN'].includes(vr)) { p += 2; len = v.getUint32(p, true); p += 4; }
    else { len = v.getUint16(p, true); p += 2; }
    if (group === 0x0002 && element === 0x0010) {
      return new TextDecoder('latin1').decode(new Uint8Array(buf, p, len)).replace(/\0+$/, '').trim();
    }
    off = p + len;
  }
  return '(none/implicit)';
}

const TS_NAMES: Record<string, string> = {
  '1.2.840.10008.1.2': 'Implicit VR LE (uncompressed)',
  '1.2.840.10008.1.2.1': 'Explicit VR LE (uncompressed)',
  '1.2.840.10008.1.2.2': 'Explicit VR BE (uncompressed)',
  '1.2.840.10008.1.2.5': 'RLE Lossless (compressed)',
  '1.2.840.10008.1.2.4.50': 'JPEG Baseline (compressed)',
  '1.2.840.10008.1.2.4.51': 'JPEG Extended (compressed)',
  '1.2.840.10008.1.2.4.57': 'JPEG Lossless (compressed)',
  '1.2.840.10008.1.2.4.70': 'JPEG Lossless SV1 (compressed)',
  '1.2.840.10008.1.2.4.90': 'JPEG 2000 Lossless (compressed)',
  '1.2.840.10008.1.2.4.91': 'JPEG 2000 (compressed)',
};

const zipBuf = new Uint8Array(readFileSync(ZIP));
const entries = unzipSync(zipBuf, {
  filter: (f) => !f.name.endsWith('/') && !f.name.startsWith('__MACOSX'),
});

const isDicomName = (n: string) => /\.(dcm|dicom|ima)$/i.test(n);
const looksDicom = (b: Uint8Array) => {
  if (b.length >= 132) {
    const m = String.fromCharCode(b[128], b[129], b[130], b[131]);
    if (m === 'DICM') return true;
  }
  const g = b[0] | (b[1] << 8);
  return g === 0x0008 || g === 0x0002;
};

const names = Object.keys(entries);
const candidates = names.filter((n) => isDicomName(n)).length > 0
  ? names.filter((n) => isDicomName(n))
  : names.filter((n) => looksDicom(entries[n]));

console.log(`entries=${names.length}  dicom-candidates=${candidates.length}`);

type Row = { tags: ReturnType<typeof parseImplicitLittleEndianDicom>; ts: string; bytes: number };
const slices: { buffer: ArrayBuffer; tags: NonNullable<Row['tags']> }[] = [];
const tsCount = new Map<string, number>();

for (const n of candidates) {
  const bytes = entries[n];
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const ts = transferSyntax(ab);
  tsCount.set(ts, (tsCount.get(ts) ?? 0) + 1);
  const tags = parseImplicitLittleEndianDicom(ab, false);
  if (tags && tags.pixelDataOffset >= 0) slices.push({ buffer: ab, tags });
}

console.log('\nTransfer syntaxes:');
for (const [ts, c] of tsCount) console.log(`  ${c.toString().padStart(3)}  ${ts}  →  ${TS_NAMES[ts] ?? 'UNKNOWN'}`);

console.log(`\nreadable slices (pixelDataOffset>=0): ${slices.length}`);

// Group by series exactly like the adapter.
const groups = new Map<string, typeof slices>();
for (const s of slices) {
  const t = s.tags;
  const k = t.seriesInstanceUid ?? `${t.columns}x${t.rows}`;
  (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
}
const sortedGroups = [...groups.values()].sort((a, b) => b.length - a.length);
console.log(`\nseries groups: ${groups.size}`);
for (const g of sortedGroups.slice(0, 12)) {
  const t = g[0].tags;
  const depth = g.reduce((n, s) => n + s.tags.numberOfFrames, 0);
  const f32mb = (t.columns * t.rows * depth * 4) / 1e6;
  console.log(
    `  count=${g.length.toString().padStart(3)} ${t.columns}x${t.rows} bits=${t.bitsAllocated} frames/slice=${t.numberOfFrames} depth=${depth} → Float32 ${f32mb.toFixed(1)} MB  desc="${t.seriesDescription ?? ''}" mod=${t.modality}`,
  );
}

// Now actually try the assembly of the largest group, catching the real error.
const picked = sortedGroups[0];
const sorted = sortDicomSlices(picked);
const first = sorted[0].tags;
const width = first.columns, height = first.rows;
const depth = sorted.reduce((n, s) => n + s.tags.numberOfFrames, 0);
console.log(`\nAssembling largest: ${width}x${height}x${depth} = ${(width*height*depth*4/1e6).toFixed(1)} MB Float32`);
try {
  const voxels = new Float32Array(width * height * depth);
  let zOff = 0;
  for (const { buffer, tags } of sorted) {
    if (tags.columns !== width || tags.rows !== height) continue;
    const count = tags.rows * tags.columns * tags.numberOfFrames;
    const dv = new DataView(buffer, tags.pixelDataOffset);
    const needed = count * (tags.bitsAllocated === 16 ? 2 : tags.bitsAllocated === 32 ? 4 : 1);
    const have = buffer.byteLength - tags.pixelDataOffset;
    if (needed > have) {
      console.log(`  ⚠ slice short: needs ${needed}B but only ${have}B after pixelDataOffset (bits=${tags.bitsAllocated}, frames=${tags.numberOfFrames})`);
    }
    // mimic readPixels (uint16)
    for (let i = 0; i < count; i++) voxels[zOff * width * height + i] = dv.getInt16(i * 2, true);
    zOff += tags.numberOfFrames;
  }
  console.log('  assembly OK');
} catch (err) {
  console.log(`  ✗ assembly threw: ${(err as Error).name}: ${(err as Error).message}`);
}
