import { importFormatAdapters } from '@/lib/import/adapters';
import type { ImportFile, ImportSource, ProgressFn, SeriesChoice } from '@/lib/import/types';
import type { LoadedVolume } from '@/types';
import { unzipSync } from 'fflate';

/**
 * Result of {@link loadVolumeFromSource}: either the parsed volume, or — when
 * the source holds several series and the caller has not picked one — the list
 * of choices to present, after which the caller re-runs with a `seriesKey`.
 */
export type LoadOutcome =
  | { kind: 'volume'; volume: LoadedVolume }
  | { kind: 'series-choice'; series: SeriesChoice[] };

async function expandZips(source: ImportSource, onProgress: ProgressFn): Promise<ImportSource> {
  const zips = source.files.filter((f) => f.name.endsWith('.zip'));
  if (zips.length === 0) return source;

  onProgress({ stage: 'scanning', message: 'Extracting archive…' });
  const expanded: ImportFile[] = source.files.filter((f) => !f.name.endsWith('.zip'));
  for (const z of zips) {
    const buf = new Uint8Array(await z.file.arrayBuffer());
    const entries = unzipSync(buf, {
      filter: (file) => !file.name.endsWith('/') && !file.name.startsWith('__MACOSX'),
    });
    for (const [path, bytes] of Object.entries(entries)) {
      // `pop()` is safe: an entry path is never an empty string. Fall back to
      // the full path for the (impossible) empty case rather than asserting.
      const name = (path.split('/').pop() ?? path).toLowerCase();
      const file = new File([new Uint8Array(bytes)], name);
      expanded.push({ path, name, file });
    }
  }
  return { rootName: source.rootName, files: expanded };
}

export async function loadVolumeFromSource(
  rawSource: ImportSource,
  onProgress: ProgressFn,
  seriesKey?: string,
): Promise<LoadOutcome> {
  onProgress({ stage: 'scanning', current: 0, total: 0, message: 'Detecting format…' });
  const source = await expandZips(rawSource, onProgress);

  // `matches` may be async (content-sniffing adapters), so resolve them in
  // priority order rather than with a synchronous `Array.find`.
  let adapter: (typeof importFormatAdapters)[number] | undefined;
  for (const a of importFormatAdapters) {
    if (await a.matches(source)) {
      adapter = a;
      break;
    }
  }
  if (!adapter) {
    throw new Error(
      'Unrecognized format. Supported: DICOM series, NIfTI (.nii/.nii.gz), NRRD, MHA/MHD.',
    );
  }

  // Multi-series sources (DICOM): if the caller hasn't picked one yet, enumerate
  // from headers and hand the choices back. Single-series falls straight
  // through, so the common case keeps its single pass.
  if (!seriesKey && adapter.listSeries) {
    const series = await adapter.listSeries(source);
    if (series.length > 1) {
      return { kind: 'series-choice', series };
    }
  }

  onProgress({ stage: 'parsing-headers', message: `Reading ${adapter.label}…` });
  const volume = await adapter.parse(source, onProgress, seriesKey);
  onProgress({ stage: 'done', message: 'Volume ready', current: 1, total: 1 });
  return { kind: 'volume', volume };
}
