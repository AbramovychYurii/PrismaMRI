import type { ImportProgress, LoadedVolume } from '@/types';

export interface ImportFile {
  /** Posix relative path inside the dropped folder (or just the file name). */
  path: string;
  /** Lowercased base name for cheap matching. */
  name: string;
  file: File;
}

export interface ImportSource {
  rootName: string;
  files: ImportFile[];
}

export type ProgressFn = (p: Partial<ImportProgress>) => void;

export interface ImportFormatAdapter {
  id: LoadedVolume['formatId'];
  label: string;
  /**
   * Decide whether this adapter can handle the source. Cheap name checks are
   * preferred, but an adapter may sniff file *content* (e.g. extensionless
   * DICOM) and therefore return a promise.
   */
  matches: (source: ImportSource) => boolean | Promise<boolean>;
  /** Full parse → in-memory volume. */
  parse: (source: ImportSource, onProgress: ProgressFn) => Promise<LoadedVolume>;
}
