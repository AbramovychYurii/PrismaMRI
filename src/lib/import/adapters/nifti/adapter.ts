import { gunzipBytes, readBlobBytes } from '@/lib/import/read-file';
import type { ImportFormatAdapter, ImportSource, ProgressFn } from '@/lib/import/types';
import { resolveWindowLevel } from '@/lib/volume/math';
import type { LoadedVolume, Vec3 } from '@/types';

function isNiftiName(name: string): boolean {
  return name.endsWith('.nii') || name.endsWith('.nii.gz') || name.endsWith('.hdr');
}

function maybeGunzip(
  buf: Uint8Array,
  onProgress: ProgressFn,
  fsize: number,
): Uint8Array {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return gunzipBytes(buf, (loaded, total) => {
      onProgress({ stage: 'reading-files', current: fsize + loaded, total: fsize + total });
    });
  }
  return buf;
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
    // Reading-files budget split — see nrrd/adapter.ts for rationale.
    const fsize = file.file.size;
    onProgress({ stage: 'reading-files', current: 0, total: fsize * 2 });
    const rawCompressed = await readBlobBytes(file.file, (loaded, total) => {
      onProgress({ stage: 'reading-files', current: loaded, total: total * 2 });
    });
    const raw = maybeGunzip(rawCompressed, onProgress, fsize);
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

    // Chunked assembling — see nrrd/adapter.ts.  The switch sits in the
    // outer chunk loop so each per-datatype inner loop stays branch-free.
    const CHUNK = 1 << 19;
    onProgress({ stage: 'assembling', current: 0, total: count });
    let scalarMin = Number.POSITIVE_INFINITY;
    let scalarMax = Number.NEGATIVE_INFINITY;
    for (let off = 0; off < count; off += CHUNK) {
      const end = Math.min(off + CHUNK, count);
      switch (datatype) {
        case 2: // uint8
          for (let i = off; i < end; i++) {
            const v = d.getUint8(i) * sclSlope + sclInter;
            out[i] = v;
            if (v < scalarMin) scalarMin = v;
            if (v > scalarMax) scalarMax = v;
          }
          break;
        case 256: // int8
          for (let i = off; i < end; i++) {
            const v = d.getInt8(i) * sclSlope + sclInter;
            out[i] = v;
            if (v < scalarMin) scalarMin = v;
            if (v > scalarMax) scalarMax = v;
          }
          break;
        case 4: // int16
          for (let i = off; i < end; i++) {
            const v = d.getInt16(i * 2, le) * sclSlope + sclInter;
            out[i] = v;
            if (v < scalarMin) scalarMin = v;
            if (v > scalarMax) scalarMax = v;
          }
          break;
        case 512: // uint16
          for (let i = off; i < end; i++) {
            const v = d.getUint16(i * 2, le) * sclSlope + sclInter;
            out[i] = v;
            if (v < scalarMin) scalarMin = v;
            if (v > scalarMax) scalarMax = v;
          }
          break;
        case 8: // int32
          for (let i = off; i < end; i++) {
            const v = d.getInt32(i * 4, le) * sclSlope + sclInter;
            out[i] = v;
            if (v < scalarMin) scalarMin = v;
            if (v > scalarMax) scalarMax = v;
          }
          break;
        case 16: // float32
          for (let i = off; i < end; i++) {
            const v = d.getFloat32(i * 4, le) * sclSlope + sclInter;
            out[i] = v;
            if (v < scalarMin) scalarMin = v;
            if (v > scalarMax) scalarMax = v;
          }
          break;
        case 64: // float64
          for (let i = off; i < end; i++) {
            const v = d.getFloat64(i * 8, le) * sclSlope + sclInter;
            out[i] = v;
            if (v < scalarMin) scalarMin = v;
            if (v > scalarMax) scalarMax = v;
          }
          break;
        default:
          throw new Error(`Unsupported NIfTI datatype ${datatype}.`);
      }
      onProgress({ stage: 'assembling', current: end, total: count });
    }
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
