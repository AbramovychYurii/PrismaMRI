import { SCALAR_BYTES, type ScalarKind, decodeScalars, inflatedSize } from '@/lib/import/decode';
import { inflateWithProgress, readWithProgress } from '@/lib/import/read-file';
import type { ImportFormatAdapter, ImportSource, ProgressFn } from '@/lib/import/types';
import { resolveWindowLevel } from '@/lib/volume/math';
import type { LoadedVolume, Vec3 } from '@/types';

function isNrrdName(name: string): boolean {
  return name.endsWith('.nrrd') || name.endsWith('.nhdr');
}

/** NRRD `type` field values the viewer decodes, and the scalar each one stores. */
const TYPE_MAP: Record<string, ScalarKind> = {
  'signed char': 'i8',
  int8: 'i8',
  'unsigned char': 'u8',
  uint8: 'u8',
  uchar: 'u8',
  short: 'i16',
  int16: 'i16',
  'unsigned short': 'u16',
  uint16: 'u16',
  ushort: 'u16',
  int: 'i32',
  int32: 'i32',
  'unsigned int': 'u32',
  uint32: 'u32',
  float: 'f32',
  double: 'f64',
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
    const bytes = await readWithProgress(file.file, onProgress);

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
    // A detached header (.nhdr) is the whole file; its blank line is optional.
    if (headerEnd < 0) {
      if (!file.name.endsWith('.nhdr')) throw new Error('Malformed NRRD header.');
      headerEnd = bytes.length;
    }

    const header = new TextDecoder('latin1').decode(bytes.subarray(0, headerEnd));
    const fields = new Map<string, string>();
    for (const line of header.split(/\r?\n/)) {
      const m = line.match(/^([^:#]+):\s?[=]?\s*(.+)$/);
      if (m) fields.set(m[1].trim().toLowerCase(), m[2].trim());
    }

    const type = (fields.get('type') ?? '').toLowerCase();
    const kind = TYPE_MAP[type];
    if (!kind) throw new Error(`Unsupported NRRD type "${type}".`);
    const bytesPerVoxel = SCALAR_BYTES[kind];

    const sizes = (fields.get('sizes') ?? '').split(/\s+/).map(Number);
    if (sizes.length < 3) throw new Error('NRRD must be 3-dimensional.');
    const [nx, ny, nz] = sizes;

    const encoding = (fields.get('encoding') ?? 'raw').toLowerCase();
    const le = (fields.get('endian') ?? 'little').toLowerCase() === 'little';

    const count = nx * ny * nz;
    if (encoding !== 'raw' && encoding !== 'gzip' && encoding !== 'gz') {
      throw new Error(`Unsupported NRRD encoding "${encoding}".`);
    }
    const compressed = encoding !== 'raw';

    // Voxels follow the header, or live in the file a "data file" field names
    // (the usual .nhdr layout), relative to the header.
    let payload: Uint8Array;
    let payloadFileSize = file.file.size;
    const dataFile = fields.get('data file') ?? fields.get('datafile');
    if (dataFile) {
      if (dataFile.startsWith('LIST') || dataFile.includes('%') || /\s/.test(dataFile)) {
        throw new Error(`NRRD data split across several files ("${dataFile}") is not supported.`);
      }
      const dataName = (dataFile.split(/[\\/]/).pop() ?? dataFile).toLowerCase();
      const data = source.files.find((f) => f.name === dataName);
      if (!data) {
        throw new Error(
          `${file.name} keeps its voxels in "${dataName}" — select both files (or their folder).`,
        );
      }
      payloadFileSize = data.file.size;
      payload = await readWithProgress(data.file, onProgress);
    } else {
      payload = bytes.subarray(headerEnd);
    }

    if (Number(fields.get('line skip') ?? 0) !== 0) {
      throw new Error('NRRD "line skip" is not supported.');
    }
    if (compressed) {
      payload = await inflateWithProgress(
        payload,
        payloadFileSize,
        onProgress,
        inflatedSize(count, bytesPerVoxel),
      );
    }
    // "byte skip" counts bytes of the (decompressed) data; -1 means the voxels
    // are the last bytes of a raw file.
    const byteSkip = Number(fields.get('byte skip') ?? 0);
    if (byteSkip === -1 && !compressed) {
      payload = payload.subarray(Math.max(0, payload.length - count * bytesPerVoxel));
    } else if (byteSkip > 0) {
      payload = payload.subarray(byteSkip);
    } else if (byteSkip !== 0) {
      throw new Error(`Unsupported NRRD byte skip "${fields.get('byte skip')}".`);
    }

    // Integer sources that fit Int16 stay Int16 (halves memory on big 16-bit
    // volumes); ushort/uint/float widen to Float32.
    const out =
      bytesPerVoxel === 1 || kind === 'i16' ? new Int16Array(count) : new Float32Array(count);
    const { min: scalarMin, max: scalarMax } = decodeScalars(
      new DataView(payload.buffer, payload.byteOffset, payload.byteLength),
      kind,
      out,
      { littleEndian: le },
      onProgress,
    );

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
    } else {
      const spacings = fields.get('spacings');
      if (spacings) {
        const sp = spacings.split(/\s+/).map(Number);
        if (sp.length >= 3) spacing = [sp[0] || 1, sp[1] || 1, sp[2] || 1];
      }
    }

    return {
      voxels: out,
      meta: {
        modality: 'CT',
        protocol: file.name,
        spacing,
        origin: [0, 0, 0],
        dims: [nx, ny, nz],
        bitsAllocated: bytesPerVoxel * 8,
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
