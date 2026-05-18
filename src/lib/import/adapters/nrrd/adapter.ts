import type { ImportFormatAdapter, ImportSource, ProgressFn } from '@/lib/import/types';
import { resolveWindowLevel } from '@/lib/volume/math';
import type { LoadedVolume, Vec3 } from '@/types';
import { gunzipSync } from 'fflate';

function isNrrdName(name: string): boolean {
  return name.endsWith('.nrrd') || name.endsWith('.nhdr');
}

const TYPE_MAP: Record<
  string,
  { bytes: number; read: (dv: DataView, o: number, le: boolean) => number }
> = {
  'signed char': { bytes: 1, read: (d, o) => d.getInt8(o) },
  int8: { bytes: 1, read: (d, o) => d.getInt8(o) },
  'unsigned char': { bytes: 1, read: (d, o) => d.getUint8(o) },
  uint8: { bytes: 1, read: (d, o) => d.getUint8(o) },
  uchar: { bytes: 1, read: (d, o) => d.getUint8(o) },
  short: { bytes: 2, read: (d, o, le) => d.getInt16(o, le) },
  int16: { bytes: 2, read: (d, o, le) => d.getInt16(o, le) },
  'unsigned short': { bytes: 2, read: (d, o, le) => d.getUint16(o, le) },
  uint16: { bytes: 2, read: (d, o, le) => d.getUint16(o, le) },
  ushort: { bytes: 2, read: (d, o, le) => d.getUint16(o, le) },
  int: { bytes: 4, read: (d, o, le) => d.getInt32(o, le) },
  int32: { bytes: 4, read: (d, o, le) => d.getInt32(o, le) },
  'unsigned int': { bytes: 4, read: (d, o, le) => d.getUint32(o, le) },
  uint32: { bytes: 4, read: (d, o, le) => d.getUint32(o, le) },
  float: { bytes: 4, read: (d, o, le) => d.getFloat32(o, le) },
  double: { bytes: 8, read: (d, o, le) => d.getFloat64(o, le) },
};

export const nrrdAdapter: ImportFormatAdapter = {
  id: 'nrrd',
  label: 'NRRD',
  matches(source) {
    return source.files.some((f) => isNrrdName(f.name));
  },
  async parse(source: ImportSource, onProgress: ProgressFn): Promise<LoadedVolume> {
    const file = source.files.find((f) => isNrrdName(f.name));
    if (!file) throw new Error('No NRRD file found.');
    onProgress({ stage: 'reading-files', current: 0, total: 1 });

    const bytes = new Uint8Array(await file.file.arrayBuffer());

    // Header is ASCII, terminated by a blank line (\n\n).
    let headerEnd = -1;
    for (let i = 1; i < bytes.length; i++) {
      if (bytes[i] === 0x0a && bytes[i - 1] === 0x0a) {
        headerEnd = i + 1;
        break;
      }
      if (
        bytes[i] === 0x0a &&
        bytes[i - 1] === 0x0d &&
        i >= 3 &&
        bytes[i - 2] === 0x0a &&
        bytes[i - 3] === 0x0d
      ) {
        headerEnd = i + 1;
        break;
      }
    }
    if (headerEnd < 0) throw new Error('Malformed NRRD header.');

    const header = new TextDecoder('latin1').decode(bytes.subarray(0, headerEnd));
    const fields = new Map<string, string>();
    for (const line of header.split(/\r?\n/)) {
      const m = line.match(/^([^:#]+):\s?[=]?\s*(.+)$/);
      if (m) fields.set(m[1].trim().toLowerCase(), m[2].trim());
    }

    const type = (fields.get('type') ?? '').toLowerCase();
    const desc = TYPE_MAP[type];
    if (!desc) throw new Error(`Unsupported NRRD type "${type}".`);

    const sizes = (fields.get('sizes') ?? '').split(/\s+/).map(Number);
    if (sizes.length < 3) throw new Error('NRRD must be 3-dimensional.');
    const [nx, ny, nz] = sizes;

    const encoding = (fields.get('encoding') ?? 'raw').toLowerCase();
    const le = (fields.get('endian') ?? 'little').toLowerCase() === 'little';

    let payload: Uint8Array = bytes.subarray(headerEnd);
    if (encoding === 'gzip' || encoding === 'gz') {
      payload = new Uint8Array(gunzipSync(payload));
    } else if (encoding !== 'raw') {
      throw new Error(`Unsupported NRRD encoding "${encoding}".`);
    }

    const count = nx * ny * nz;
    const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    // Integer sources that fit Int16 stay Int16 (halves memory on big 16-bit
    // volumes); ushort/uint/float widen to Float32.
    const fitsI16 =
      desc.bytes === 1 || type === 'short' || type === 'int16' || type === 'signed short';
    const out: Float32Array | Int16Array = fitsI16
      ? new Int16Array(count)
      : new Float32Array(count);
    onProgress({ stage: 'assembling', current: 0, total: 1 });
    for (let i = 0; i < count; i++) out[i] = desc.read(dv, i * desc.bytes, le);

    // spacing from "space directions" or "spacings"
    let spacing: Vec3 = [1, 1, 1];
    const sd = fields.get('space directions');
    if (sd) {
      const vecs = [...sd.matchAll(/\(([^)]+)\)/g)].map((mm) => mm[1].split(',').map(Number));
      if (vecs.length >= 3) {
        spacing = [
          Math.hypot(...vecs[0]) || 1,
          Math.hypot(...vecs[1]) || 1,
          Math.hypot(...vecs[2]) || 1,
        ];
      }
    } else if (fields.get('spacings')) {
      const sp = fields.get('spacings')!.split(/\s+/).map(Number);
      if (sp.length >= 3) spacing = [sp[0] || 1, sp[1] || 1, sp[2] || 1];
    }

    let scalarMin = Number.POSITIVE_INFINITY;
    let scalarMax = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < count; i++) {
      const v = out[i];
      if (v < scalarMin) scalarMin = v;
      if (v > scalarMax) scalarMax = v;
    }

    return {
      voxels: out,
      meta: {
        modality: 'CT',
        protocol: file.name,
        spacing,
        origin: [0, 0, 0],
        dims: [nx, ny, nz],
        bitsAllocated: desc.bytes * 8,
        rescaleSlope: 1,
        rescaleIntercept: 0,
      },
      scalarMin,
      scalarMax,
      windowLevel: resolveWindowLevel(scalarMin, scalarMax),
      formatId: 'nrrd',
    };
  },
};
