import type { ImportFormatAdapter } from '../types';
import { dicomAdapter } from './dicom/adapter';
import { mhaAdapter } from './mha/adapter';
import { niftiAdapter } from './nifti/adapter';
import { nrrdAdapter } from './nrrd/adapter';

/** Single-file formats are checked before DICOM (folder of slices). */
export const importFormatAdapters: ImportFormatAdapter[] = [
  niftiAdapter,
  nrrdAdapter,
  mhaAdapter,
  dicomAdapter,
];
