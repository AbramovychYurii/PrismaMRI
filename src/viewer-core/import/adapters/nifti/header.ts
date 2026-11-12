import type { Vec3 } from '../../../types';
import { type AxisDirections, rasToLps } from '../../../volume/orientation';
import type { ScalarKind } from '../../decode';

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
  /** qform_code / sform_code — 0 means that transform is not set. */
  qformCode: number;
  sformCode: number;
  /** quatern_b, quatern_c, quatern_d. */
  quatern: Vec3;
  /** pixdim[0]: the qform's handedness, -1 or (anything else) +1. */
  qfac: number;
  /** srow_x, srow_y, srow_z: the first three columns of the sform's rows. */
  srow: [Vec3, Vec3, Vec3];
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
    qformCode: view.getInt16(252, le),
    sformCode: view.getInt16(254, le),
    quatern: [view.getFloat32(256, le), view.getFloat32(260, le), view.getFloat32(264, le)],
    qfac: view.getFloat32(76, le) < 0 ? -1 : 1,
    srow: [280, 296, 312].map((at) => [
      view.getFloat32(at, le),
      view.getFloat32(at + 4, le),
      view.getFloat32(at + 8, le),
    ]) as [Vec3, Vec3, Vec3],
  };
}

/**
 * Patient direction (LPS) of each voxel axis, from the sform when it is set,
 * else the qform — the order nibabel's `get_best_affine` uses. Undefined for
 * Analyze 7.5 headers, whose bytes there hold other fields, and when neither
 * transform is set: the method-1 fallback only scales, it does not orient.
 */
export function niftiAxisDirections(h: NiftiHeader): AxisDirections | undefined {
  if (h.magic !== 'n+1' && h.magic !== 'ni1') return undefined;
  if (h.sformCode > 0) {
    const [x, y, z] = h.srow;
    // Column a of the sform's 3×3 is where voxel axis a points.
    return [
      rasToLps([x[0], y[0], z[0]]),
      rasToLps([x[1], y[1], z[1]]),
      rasToLps([x[2], y[2], z[2]]),
    ];
  }
  if (h.qformCode > 0) {
    // Rotation from the unit quaternion (b, c, d), a = √(1 − b² − c² − d²),
    // as nifti1_io's quatern_to_mat44 builds it; qfac flips the third axis.
    const [b, c, d] = h.quatern;
    const a = Math.sqrt(Math.max(0, 1 - b * b - c * c - d * d));
    const q = h.qfac;
    return [
      rasToLps([a * a + b * b - c * c - d * d, 2 * (b * c + a * d), 2 * (b * d - a * c)]),
      rasToLps([2 * (b * c - a * d), a * a + c * c - b * b - d * d, 2 * (c * d + a * b)]),
      rasToLps([
        q * 2 * (b * d + a * c),
        q * 2 * (c * d - a * b),
        q * (a * a + d * d - c * c - b * b),
      ]),
    ];
  }
  return undefined;
}

export function niftiScalarKind(datatype: number): ScalarKind {
  const kind = DATATYPES[datatype];
  if (!kind) throw new Error(`Unsupported NIfTI datatype ${datatype}.`);
  return kind;
}
