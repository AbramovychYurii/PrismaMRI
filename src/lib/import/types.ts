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

/**
 * One selectable series within a multi-series import (a DICOM folder/zip can
 * bundle many acquisitions). Carries just enough header-derived metadata for
 * the user to choose, plus a stable `key` the parser filters on.
 */
export interface SeriesChoice {
  /** Stable group key (SeriesInstanceUID, else a geometry fingerprint). */
  key: string;
  /** Human label — series description, falling back to a generic name. */
  label: string;
  /** Slice count in the series. */
  count: number;
  rows: number;
  columns: number;
  modality?: string;
  orientation?: 'Axial' | 'Sagittal' | 'Coronal' | 'Oblique';
}

export interface ImportFormatAdapter {
  id: LoadedVolume['formatId'];
  label: string;
  /**
   * Decide whether this adapter can handle the source. Cheap name checks are
   * preferred, but an adapter may sniff file *content* (e.g. extensionless
   * DICOM) and therefore return a promise.
   */
  matches: (source: ImportSource) => boolean | Promise<boolean>;
  /**
   * Optional: enumerate the selectable series in the source from headers only
   * (used to offer a picker). Formats with no series concept omit this.
   */
  listSeries?: (source: ImportSource) => Promise<SeriesChoice[]>;
  /**
   * Full parse → in-memory volume. `seriesKey` (when given) restricts the
   * assembly to one series from {@link listSeries}.
   */
  parse: (
    source: ImportSource,
    onProgress: ProgressFn,
    seriesKey?: string,
  ) => Promise<LoadedVolume>;
}
