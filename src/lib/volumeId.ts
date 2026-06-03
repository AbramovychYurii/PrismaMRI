import type { LoadedVolume } from '@/types';

/**
 * Derives a stable, deterministic string ID for a loaded volume.
 *
 * The ID is built from physical properties of the data — format, voxel
 * dimensions, spacing, bit depth, and scalar range — so the same file always
 * produces the same ID without hashing the full voxel buffer.
 *
 * Optional DICOM studyId and protocol are appended when present to further
 * differentiate studies that happen to share identical geometry.
 */
export function deriveVolumeId(volume: LoadedVolume): string {
  const { meta, formatId, scalarMin, scalarMax } = volume;
  const parts: (string | number)[] = [
    formatId,
    meta.dims.join('x'),
    meta.spacing.map((s) => s.toFixed(4)).join('x'),
    meta.bitsAllocated,
    Math.round(scalarMin),
    Math.round(scalarMax),
  ];
  if (meta.studyId) parts.push(meta.studyId);
  if (meta.protocol) parts.push(meta.protocol);
  return parts.join(':');
}
