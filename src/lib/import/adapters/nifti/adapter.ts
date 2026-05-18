import type { ImportFormatAdapter, ImportSource, ProgressFn } from '@/lib/import/types';
import { resolveWindowLevel } from '@/lib/volume/math';
import type { LoadedVolume, Vec3 } from '@/types';
import { gunzipSync } from 'fflate';

function isNiftiName(name: string): boolean {
  return name.endsWith('.nii') || name.endsWith('.nii.gz') || name.endsWith('.hdr');
}

function maybeGunzip(buf: Uint8Array): Uint8Array {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf);
  return buf;
}

function scalarRange(data: Float32Array): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

export const niftiAdapter: ImportFormatAdapter = {
  id: 'nifti',
  label: 'NIfTI',
  matches(source) {
    return source.files.some((f) => isNiftiName(f.name));
  },
  async parse(source: ImportSource, onProgress: ProgressFn): Promise<LoadedVolume> {
    const file = source.files.find((f) => isNiftiName(f.name));
    if (!file) throw new Error('No NIfTI file found.');
    onProgress({ stage: 'reading-files', current: 0, total: 1 });

    const raw = maybeGunzip(new Uint8Array(await file.file.arrayBuffer()));
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

    // Endianness: sizeof_hdr must read as 348.
    let le = true;
    let sizeofHdr = view.getInt32(0, true);
    if (sizeofHdr !== 348) {
      sizeofHdr = view.getInt32(0, false);
      le = false;
    }
    if (sizeofHdr !== 348) throw new Error('Not a NIfTI-1 file.');

    const ndim = view.getInt16(40, le);
    const nx = view.getInt16(42, le);
    const ny = view.getInt16(44, le);
    const nz = ndim >= 3 ? view.getInt16(46, le) : 1;

    const datatype = view.getInt16(70, le);
    const dx = view.getFloat32(80, le);
    const dy = view.getFloat32(84, le);
    const dz = view.getFloat32(88, le);
    const voxOffset = Math.round(view.getFloat32(108, le)) || 352;
    let sclSlope = view.getFloat32(112, le);
    const sclInter = view.getFloat32(116, le);
    if (!Number.isFinite(sclSlope) || sclSlope === 0) sclSlope = 1;

    const count = nx * ny * nz;
    const out = new Float32Array(count);
    const d = new DataView(raw.buffer, raw.byteOffset + voxOffset);

    onProgress({ stage: 'assembling', current: 0, total: 1 });
    switch (datatype) {
      case 2: // uint8
        for (let i = 0; i < count; i++) out[i] = d.getUint8(i) * sclSlope + sclInter;
        break;
      case 256: // int8
        for (let i = 0; i < count; i++) out[i] = d.getInt8(i) * sclSlope + sclInter;
        break;
      case 4: // int16
        for (let i = 0; i < count; i++) out[i] = d.getInt16(i * 2, le) * sclSlope + sclInter;
        break;
      case 512: // uint16
        for (let i = 0; i < count; i++) out[i] = d.getUint16(i * 2, le) * sclSlope + sclInter;
        break;
      case 8: // int32
        for (let i = 0; i < count; i++) out[i] = d.getInt32(i * 4, le) * sclSlope + sclInter;
        break;
      case 16: // float32
        for (let i = 0; i < count; i++) out[i] = d.getFloat32(i * 4, le) * sclSlope + sclInter;
        break;
      case 64: // float64
        for (let i = 0; i < count; i++) out[i] = d.getFloat64(i * 8, le) * sclSlope + sclInter;
        break;
      default:
        throw new Error(`Unsupported NIfTI datatype ${datatype}.`);
    }

    const [scalarMin, scalarMax] = scalarRange(out);
    const spacing: Vec3 = [Math.abs(dx) || 1, Math.abs(dy) || 1, Math.abs(dz) || 1];

    return {
      voxels: out,
      meta: {
        modality: 'MR',
        protocol: file.name,
        spacing,
        origin: [0, 0, 0],
        dims: [nx, ny, nz],
        bitsAllocated: 32,
        rescaleSlope: sclSlope,
        rescaleIntercept: sclInter,
      },
      scalarMin,
      scalarMax,
      windowLevel: resolveWindowLevel(scalarMin, scalarMax),
      formatId: 'nifti',
    };
  },
};
