import type { ImportFormatAdapter } from '@/lib/import/types';
import { dicomAdapter } from '@/lib/import/adapters/dicom/adapter';
import { niftiAdapter } from '@/lib/import/adapters/nifti/adapter';
import { nrrdAdapter } from '@/lib/import/adapters/nrrd/adapter';
import { mhaAdapter } from '@/lib/import/adapters/mha/adapter';

/** Single-file formats are checked before DICOM (folder of slices). */
export const importFormatAdapters: ImportFormatAdapter[] = [
  niftiAdapter,
  nrrdAdapter,
  mhaAdapter,
  dicomAdapter,
];
