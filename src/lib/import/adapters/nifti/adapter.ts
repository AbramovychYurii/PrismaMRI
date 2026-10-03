import { niftiScalarKind, parseNiftiHeader } from '@/lib/import/adapters/nifti/header';
import { decodeScalars } from '@/lib/import/decode';
import { inflateWithProgress, readWithProgress } from '@/lib/import/read-file';
import type { ImportFormatAdapter, ImportSource, ProgressFn } from '@/lib/import/types';
import { resolveWindowLevel } from '@/lib/volume/math';
import type { LoadedVolume, Vec3 } from '@/types';

const isSingleFile = (name: string) => name.endsWith('.nii') || name.endsWith('.nii.gz');
/** The header half of a NIfTI-1 (or Analyze 7.5) .hdr/.img pair. */
const isPairHeader = (name: string) => name.endsWith('.hdr') || name.endsWith('.hdr.gz');

function isNiftiName(name: string): boolean {
  return isSingleFile(name) || isPairHeader(name);
}

function isGzip(buf: Uint8Array): boolean {
  return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

export const niftiAdapter: ImportFormatAdapter = {
  id: 'nifti',
  label: 'NIfTI',
  matches(source) {
    return source.files.some((f) => isNiftiName(f.name));
  },
  async parse(source: ImportSource, onProgress: ProgressFn): Promise<LoadedVolume> {
    const file =
      source.files.find((f) => isSingleFile(f.name)) ??
      source.files.find((f) => isPairHeader(f.name));
    if (!file) throw new Error('No NIfTI file found.');

    const read = async (f: File) => {
      const bytes = await readWithProgress(f, onProgress);
      return isGzip(bytes) ? inflateWithProgress(bytes, f.size, onProgress) : bytes;
    };

    // A single .nii holds header and voxels; a pair keeps the voxels in the
    // .img of the same name, at vox_offset (usually 0) into that file.
    let headerBytes: Uint8Array;
    let voxelBytes: Uint8Array;
    if (isPairHeader(file.name)) {
      const base = file.name.replace(/\.hdr(\.gz)?$/, '');
      const img = source.files.find((f) => f.name === `${base}.img` || f.name === `${base}.img.gz`);
      if (!img) {
        throw new Error(
          `${file.name} keeps its voxels in "${base}.img" — select both files (or their folder).`,
        );
      }
      headerBytes = await read(file.file);
      voxelBytes = await read(img.file);
    } else {
      headerBytes = await read(file.file);
      voxelBytes = headerBytes;
    }

    const header = parseNiftiHeader(
      new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength),
    );
    const kind = niftiScalarKind(header.datatype);
    const [nx, ny, nz] = header.dims;
    const voxOffset = voxelBytes === headerBytes ? header.voxOffset || 352 : header.voxOffset;

    const out = new Float32Array(nx * ny * nz);
    const { min: scalarMin, max: scalarMax } = decodeScalars(
      new DataView(voxelBytes.buffer, voxelBytes.byteOffset + voxOffset),
      kind,
      out,
      { littleEndian: header.littleEndian, slope: header.sclSlope, intercept: header.sclInter },
      onProgress,
    );

    const [dx, dy, dz] = header.pixdim;
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
        rescaleSlope: header.sclSlope,
        rescaleIntercept: header.sclInter,
      },
      scalarMin,
      scalarMax,
      windowLevel: resolveWindowLevel(scalarMin, scalarMax),
      formatId: 'nifti',
    };
  },
};
