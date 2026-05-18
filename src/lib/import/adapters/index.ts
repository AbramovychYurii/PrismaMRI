import { dicomAdapter } from '@/lib/import/adapters/dicom/adapter';
import { mhaAdapter } from '@/lib/import/adapters/mha/adapter';
import { niftiAdapter } from '@/lib/import/adapters/nifti/adapter';
import { nrrdAdapter } from '@/lib/import/adapters/nrrd/adapter';
import type { ImportFormatAdapter } from '@/lib/import/types';

/** Single-file formats are checked before DICOM (folder of slices). */
export const importFormatAdapters: ImportFormatAdapter[] = [
  niftiAdapter,
  nrrdAdapter,
  mhaAdapter,
  dicomAdapter,
];
