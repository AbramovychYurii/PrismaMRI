import type { ScalarKind } from '@/lib/import/decode';

/** NIfTI-1 datatype codes the viewer decodes, and the scalar each one stores. */
const DATATYPES: Record<number, ScalarKind> = {
  2: 'u8',
  256: 'i8',
  4: 'i16',
  512: 'u16',
  8: 'i32',
  16: 'f32',
  64: 'f64',
};

/** The NIfTI-1 header fields the viewer reads. Offsets follow the NIfTI-1 spec. */
export interface NiftiHeader {
  littleEndian: boolean;
  /** dim[1..3]; dim[3] is 1 for a 2-D image. Higher dimensions are ignored. */
  dims: [number, number, number];
  /** Raw `datatype` code. */
  datatype: number;
  /** pixdim[1..3] as stored — may be negative or zero. */
  pixdim: [number, number, number];
  /**
   * vox_offset as stored: where the voxels start in a single-file `.nii`, or
   * in the `.img` of a pair (usually 0). A single file reads 0 as 352.
   */
  voxOffset: number;
  /** 'n+1' single file, 'ni1' .hdr/.img pair, anything else Analyze 7.5. */
  magic: string;
  /** scl_slope, with 0 / non-finite treated as 1 per the spec. */
  sclSlope: number;
  sclInter: number;
}

export function parseNiftiHeader(view: DataView): NiftiHeader {
  // Endianness: sizeof_hdr must read as 348.
  let le = true;
  let sizeofHdr = view.getInt32(0, true);
  if (sizeofHdr !== 348) {
    sizeofHdr = view.getInt32(0, false);
    le = false;
  }
  if (sizeofHdr !== 348) throw new Error('Not a NIfTI-1 file.');

  const ndim = view.getInt16(40, le);
  const slope = view.getFloat32(112, le);
  return {
    littleEndian: le,
    dims: [view.getInt16(42, le), view.getInt16(44, le), ndim >= 3 ? view.getInt16(46, le) : 1],
    datatype: view.getInt16(70, le),
    pixdim: [view.getFloat32(80, le), view.getFloat32(84, le), view.getFloat32(88, le)],
    voxOffset: Math.round(view.getFloat32(108, le)),
    magic: String.fromCharCode(view.getUint8(344), view.getUint8(345), view.getUint8(346)),
    sclSlope: Number.isFinite(slope) && slope !== 0 ? slope : 1,
    sclInter: view.getFloat32(116, le),
  };
}

export function niftiScalarKind(datatype: number): ScalarKind {
  const kind = DATATYPES[datatype];
  if (!kind) throw new Error(`Unsupported NIfTI datatype ${datatype}.`);
  return kind;
}
