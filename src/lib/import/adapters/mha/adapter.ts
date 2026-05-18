import type { ImportFormatAdapter, ImportSource, ProgressFn } from '@/lib/import/types';
import { resolveWindowLevel } from '@/lib/volume/math';
import type { LoadedVolume, Vec3 } from '@/types';
import { gunzipSync } from 'fflate';

function isMhaName(name: string): boolean {
  return name.endsWith('.mha') || name.endsWith('.mhd');
}

const ELEMENT_TYPE: Record<
  string,
  { bytes: number; read: (dv: DataView, o: number, le: boolean) => number }
> = {
  MET_CHAR: { bytes: 1, read: (d, o) => d.getInt8(o) },
  MET_UCHAR: { bytes: 1, read: (d, o) => d.getUint8(o) },
  MET_SHORT: { bytes: 2, read: (d, o, le) => d.getInt16(o, le) },
  MET_USHORT: { bytes: 2, read: (d, o, le) => d.getUint16(o, le) },
  MET_INT: { bytes: 4, read: (d, o, le) => d.getInt32(o, le) },
  MET_UINT: { bytes: 4, read: (d, o, le) => d.getUint32(o, le) },
  MET_FLOAT: { bytes: 4, read: (d, o, le) => d.getFloat32(o, le) },
  MET_DOUBLE: { bytes: 8, read: (d, o, le) => d.getFloat64(o, le) },
};

export const mhaAdapter: ImportFormatAdapter = {
  id: 'mha',
  label: 'MHA / MHD',
  matches(source) {
    return source.files.some((f) => isMhaName(f.name));
  },
  async parse(source: ImportSource, onProgress: ProgressFn): Promise<LoadedVolume> {
    const file = source.files.find((f) => isMhaName(f.name));
    if (!file) throw new Error('No MHA/MHD file found.');
    onProgress({ stage: 'reading-files', current: 0, total: 1 });

    const bytes = new Uint8Array(await file.file.arrayBuffer());

    // Read ASCII header until ElementDataFile line.
    const fields = new Map<string, string>();
    let dataStart = -1;
    let lineStart = 0;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] !== 0x0a) continue;
      const line = new TextDecoder('latin1')
        .decode(bytes.subarray(lineStart, i))
        .replace(/\r$/, '');
      const eq = line.indexOf('=');
      if (eq > 0) {
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim();
        fields.set(key, val);
        if (key === 'ElementDataFile') {
          dataStart = i + 1;
          break;
        }
      }
      lineStart = i + 1;
    }

    const dims = (fields.get('DimSize') ?? '').split(/\s+/).map(Number);
    if (dims.length < 3) throw new Error('MHA must be 3-dimensional.');
    const [nx, ny, nz] = dims;

    const etype = fields.get('ElementType') ?? 'MET_SHORT';
    const desc = ELEMENT_TYPE[etype];
    if (!desc) throw new Error(`Unsupported MHA ElementType "${etype}".`);

    const le = (fields.get('BinaryDataByteOrderMSB') ?? 'False').toLowerCase() !== 'true';
    const compressed = (fields.get('CompressedData') ?? 'False').toLowerCase() === 'true';
    const elementDataFile = fields.get('ElementDataFile') ?? 'LOCAL';

    let payload: Uint8Array;
    if (elementDataFile === 'LOCAL' || isMhaName(file.name.replace(/\.mhd$/, '.mha'))) {
      if (dataStart < 0) throw new Error('MHA data segment not found.');
      payload = bytes.subarray(dataStart);
    } else {
      // .mhd referencing an external .raw — look for it in the source set.
      const rawName = elementDataFile.toLowerCase();
      const rawFile = source.files.find((f) => f.name.endsWith(rawName));
      if (!rawFile) throw new Error(`MHD references missing data file "${elementDataFile}".`);
      payload = new Uint8Array(await rawFile.file.arrayBuffer());
    }
    if (compressed) payload = gunzipSync(payload);

    const count = nx * ny * nz;
    const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const out = new Float32Array(count);
    onProgress({ stage: 'assembling', current: 0, total: 1 });
    let scalarMin = Number.POSITIVE_INFINITY;
    let scalarMax = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < count; i++) {
      const v = desc.read(dv, i * desc.bytes, le);
      out[i] = v;
      if (v < scalarMin) scalarMin = v;
      if (v > scalarMax) scalarMax = v;
    }

    const es = (fields.get('ElementSpacing') ?? fields.get('ElementSize') ?? '1 1 1')
      .split(/\s+/)
      .map(Number);
    const spacing: Vec3 = [es[0] || 1, es[1] || 1, es[2] || 1];

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
      formatId: 'mha',
    };
  },
};
