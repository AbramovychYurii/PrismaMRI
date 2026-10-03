import { SCALAR_BYTES, type ScalarKind, decodeScalars, inflatedSize } from '@/lib/import/decode';
import { inflateWithProgress, readWithProgress } from '@/lib/import/read-file';
import type { ImportFormatAdapter, ImportSource, ProgressFn } from '@/lib/import/types';
import { resolveWindowLevel } from '@/lib/volume/math';
import type { LoadedVolume, Vec3 } from '@/types';

function isMhaName(name: string): boolean {
  return name.endsWith('.mha') || name.endsWith('.mhd');
}

/** MetaImage `ElementType` values the viewer decodes, and the scalar each one stores. */
const ELEMENT_TYPE: Record<string, ScalarKind> = {
  MET_CHAR: 'i8',
  MET_UCHAR: 'u8',
  MET_SHORT: 'i16',
  MET_USHORT: 'u16',
  MET_INT: 'i32',
  MET_UINT: 'u32',
  MET_FLOAT: 'f32',
  MET_DOUBLE: 'f64',
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
    const bytes = await readWithProgress(file.file, onProgress);

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
    const kind = ELEMENT_TYPE[etype];
    if (!kind) throw new Error(`Unsupported MHA ElementType "${etype}".`);

    const le = (fields.get('BinaryDataByteOrderMSB') ?? 'False').toLowerCase() !== 'true';
    const compressed = (fields.get('CompressedData') ?? 'False').toLowerCase() === 'true';
    const elementDataFile = fields.get('ElementDataFile') ?? 'LOCAL';

    let payload: Uint8Array;
    let payloadFileSize = file.file.size;
    if (elementDataFile === 'LOCAL') {
      if (dataStart < 0) throw new Error('MHA data segment not found.');
      payload = bytes.subarray(dataStart);
    } else {
      // A .mhd header names its data file (.raw, or .zraw when compressed),
      // relative to itself — match it by base name among the selected files.
      if (elementDataFile === 'LIST' || elementDataFile.includes('%')) {
        throw new Error(
          `MHD data split across several files ("${elementDataFile}") is not supported.`,
        );
      }
      const rawName = (elementDataFile.split(/[\\/]/).pop() ?? elementDataFile).toLowerCase();
      const rawFile = source.files.find((f) => f.name === rawName);
      if (!rawFile) {
        throw new Error(
          `${file.name} keeps its voxels in "${rawName}" — select both files (or their folder).`,
        );
      }
      payloadFileSize = rawFile.file.size;
      payload = await readWithProgress(rawFile.file, onProgress);
    }
    if (compressed) {
      payload = await inflateWithProgress(
        payload,
        payloadFileSize,
        onProgress,
        inflatedSize(nx * ny * nz, SCALAR_BYTES[kind]),
      );
    }

    const out = new Float32Array(nx * ny * nz);
    const { min: scalarMin, max: scalarMax } = decodeScalars(
      new DataView(payload.buffer, payload.byteOffset, payload.byteLength),
      kind,
      out,
      { littleEndian: le },
      onProgress,
    );

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
        bitsAllocated: SCALAR_BYTES[kind] * 8,
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
